import asyncio
from collections.abc import Awaitable, Callable

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from redis.asyncio import Redis

from ecom_common.events import EventEnvelope, Topics
from ecom_common.logging import get_logger

log = get_logger("kafka")

Handler = Callable[[EventEnvelope], Awaitable[None]]

IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 3600
HANDLER_RETRIES = 3
PRODUCE_RETRIES = 3


class EventProducer:
    def __init__(self, bootstrap_servers: str, service_name: str):
        self.service_name = service_name
        self._producer = AIOKafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: v.encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            enable_idempotence=True,
        )
        self._started = False
        self._start_task: asyncio.Task | None = None

    async def start(self) -> None:
        """Connect in the background so a slow/absent broker never blocks service boot.

        The retry loop tolerates broker boot lag (kept from the original services);
        publish() raises until the connection is up and callers log-and-continue.
        """

        async def _connect() -> None:
            attempt = 0
            while not self._started:
                try:
                    await self._producer.start()
                    self._started = True
                    log.info("kafka_producer_started")
                except Exception as exc:
                    attempt += 1
                    wait = min(2**attempt, 30)
                    log.warning("kafka_producer_start_retry", error=str(exc), retry_in=wait)
                    await asyncio.sleep(wait)

        self._start_task = asyncio.create_task(_connect())

    async def stop(self) -> None:
        if self._start_task and not self._start_task.done():
            self._start_task.cancel()
        if self._started:
            await self._producer.stop()
            self._started = False

    async def publish(self, topic: str, envelope: EventEnvelope) -> None:
        if not self._started:
            raise RuntimeError("Kafka producer not connected yet")
        payload = envelope.model_dump_json()
        last_exc: Exception | None = None
        for attempt in range(1, PRODUCE_RETRIES + 1):
            try:
                await self._producer.send_and_wait(topic, payload, key=envelope.partition_key)
                log.info("event_published", topic=topic, event_type=envelope.event_type, event_id=envelope.event_id)
                return
            except Exception as exc:
                last_exc = exc
                log.warning("event_publish_retry", topic=topic, attempt=attempt, error=str(exc))
                await asyncio.sleep(2 ** (attempt - 1))
        log.error("event_publish_failed", topic=topic, event_type=envelope.event_type, error=str(last_exc))
        raise last_exc  # type: ignore[misc]


class EventConsumer:
    """Kafka consumer with per-event-type handlers, Redis idempotency, retry, and DLQ.

    - Idempotency: SET NX claim on evt:{group}:{event_id}; duplicate -> skip.
    - Failure: 3 in-process retries (1s/2s/4s) then produce to <topic>.dlq and
      commit, so a poison message never wedges the partition.
    """

    def __init__(self, *, bootstrap_servers: str, group_id: str, topics: list[str], redis: Redis, producer: EventProducer):
        self.group_id = group_id
        self.topics = topics
        self.redis = redis
        self.producer = producer
        self._handlers: dict[str, Handler] = {}
        self._consumer = AIOKafkaConsumer(
            *topics,
            bootstrap_servers=bootstrap_servers,
            group_id=group_id,
            enable_auto_commit=False,
            auto_offset_reset="earliest",
            value_deserializer=lambda v: v.decode("utf-8"),
        )
        self._task: asyncio.Task | None = None
        self._running = False

    def on(self, event_type: str, handler: Handler) -> None:
        self._handlers[event_type] = handler

    async def start(self) -> None:
        attempt = 0
        while True:
            try:
                await self._consumer.start()
                break
            except Exception as exc:
                attempt += 1
                wait = min(2**attempt, 30)
                log.warning("kafka_consumer_start_retry", group=self.group_id, error=str(exc), retry_in=wait)
                await asyncio.sleep(wait)
        self._running = True
        self._task = asyncio.create_task(self._loop())
        log.info("kafka_consumer_started", group=self.group_id, topics=self.topics)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self._consumer.stop()

    async def _loop(self) -> None:
        async for msg in self._consumer:
            if not self._running:
                break
            try:
                await self._process(msg)
            except Exception:
                log.exception("consumer_process_fatal", topic=msg.topic, offset=msg.offset)
            await self._consumer.commit()

    async def _process(self, msg) -> None:
        try:
            envelope = EventEnvelope.model_validate_json(msg.value)
        except Exception as exc:
            log.error("event_deserialize_failed", topic=msg.topic, offset=msg.offset, error=str(exc))
            await self._send_dlq(msg.topic, msg.value, error=f"deserialize: {exc}", attempts=0)
            return

        handler = self._handlers.get(envelope.event_type)
        if handler is None:
            return  # not interested in this event type

        claim_key = f"evt:{self.group_id}:{envelope.event_id}"
        claimed = await self.redis.set(claim_key, "1", nx=True, ex=IDEMPOTENCY_TTL_SECONDS)
        if not claimed:
            log.info("event_skipped_duplicate", event_id=envelope.event_id, group=self.group_id)
            return

        for attempt in range(1, HANDLER_RETRIES + 1):
            try:
                await handler(envelope)
                log.info("event_handled", event_type=envelope.event_type, event_id=envelope.event_id, group=self.group_id)
                return
            except Exception as exc:
                log.warning("event_handler_retry", event_type=envelope.event_type, attempt=attempt, error=str(exc))
                if attempt < HANDLER_RETRIES:
                    await asyncio.sleep(2 ** (attempt - 1))
                else:
                    await self.redis.delete(claim_key)  # allow future redelivery attempts to process
                    await self._send_dlq(msg.topic, msg.value, error=str(exc), attempts=attempt)

    async def _send_dlq(self, topic: str, raw_value: str, *, error: str, attempts: int) -> None:
        dlq_topic = Topics.dlq(topic)
        try:
            await self.producer._producer.send_and_wait(
                dlq_topic,
                raw_value,
                headers=[
                    ("original_consumer_group", self.group_id.encode()),
                    ("error", error[:500].encode()),
                    ("attempts", str(attempts).encode()),
                ],
            )
            log.error("event_sent_to_dlq", dlq_topic=dlq_topic, error=error)
        except Exception:
            log.exception("dlq_publish_failed", dlq_topic=dlq_topic)
