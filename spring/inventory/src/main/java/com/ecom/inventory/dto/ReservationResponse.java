package com.ecom.inventory.dto;

import com.ecom.inventory.entity.Reservation;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReservationResponse {
	private Long id;
	private Long productId;
	private String userId;
	private Integer quantity;
	private LocalDateTime reservedAt;
	private LocalDateTime expiresAt;
	private Boolean isReleased;

	public static ReservationResponse fromEntity(Reservation reservation) {
		return ReservationResponse.builder()
				.id(reservation.getId())
				.productId(reservation.getProductId())
				.userId(reservation.getUserId())
				.quantity(reservation.getQuantity())
				.reservedAt(reservation.getReservedAt())
				.expiresAt(reservation.getExpiresAt())
				.isReleased(reservation.getIsReleased())
				.build();
	}
}
