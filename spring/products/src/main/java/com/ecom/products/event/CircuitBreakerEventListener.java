package com.ecom.products.event;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.event.CircuitBreakerEvent;
import io.github.resilience4j.core.registry.EntryAddedEvent;
import io.github.resilience4j.core.registry.EntryRemovedEvent;
import io.github.resilience4j.core.registry.RegistryEventConsumer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Listener for Circuit Breaker state changes.
 * Logs transitions: CLOSED -> OPEN -> HALF_OPEN -> CLOSED
 */
@Slf4j
@Component
public class CircuitBreakerEventListener implements RegistryEventConsumer<CircuitBreaker> {

    @Override
    public void onEntryAdded(EntryAddedEvent<CircuitBreaker> entryAddedEvent) {
        CircuitBreaker circuitBreaker = entryAddedEvent.getAddedEntry();
        circuitBreaker.getEventPublisher()
            .onEvent(this::logCircuitBreakerEvent);
    }

    @Override
    public void onEntryRemoved(EntryRemovedEvent<CircuitBreaker> entryRemovalEvent) {
        // No action needed on removal
    }

    /**
     * Log circuit breaker state transitions.
     *
     * @param event CircuitBreakerEvent with state change information
     */
    private void logCircuitBreakerEvent(CircuitBreakerEvent event) {
        switch (event.getEventType()) {
            case STATE_TRANSITION:
                log.warn("Circuit Breaker '{}' state transition: {} -> {}",
                    event.getCircuitBreakerName(),
                    event.getStateTransition().getFromState(),
                    event.getStateTransition().getToState());
                break;
            case ERROR:
                log.debug("Circuit Breaker '{}' recorded error: {}",
                    event.getCircuitBreakerName(),
                    event.getThrowable().getClass().getSimpleName());
                break;
            case SUCCESS:
                log.debug("Circuit Breaker '{}' recorded success",
                    event.getCircuitBreakerName());
                break;
            case IGNORED_ERROR:
                log.debug("Circuit Breaker '{}' ignored error: {}",
                    event.getCircuitBreakerName(),
                    event.getThrowable().getClass().getSimpleName());
                break;
            case SLOW_CALL:
                log.debug("Circuit Breaker '{}' slow call detected (duration: {}ms)",
                    event.getCircuitBreakerName(),
                    event.getDurationInMs());
                break;
            case NOT_PERMITTED:
                log.warn("Circuit Breaker '{}' rejected call (state: {})",
                    event.getCircuitBreakerName(),
                    event.getCircuitBreaker().getState());
                break;
            default:
                log.debug("Circuit Breaker '{}' event: {}",
                    event.getCircuitBreakerName(),
                    event.getEventType());
        }
    }
}
