package com.ecom.inventory.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.RequiredArgsConstructor;

import java.util.Objects;
import java.util.UUID;

@Data
@AllArgsConstructor
@RequiredArgsConstructor
public class IdempotencyKey {
    private final UUID eventId;
    private final String eventType;
}
