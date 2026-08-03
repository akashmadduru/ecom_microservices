package com.ecom.inventory.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "reservations")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Reservation {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private Long productId;

	@Column(nullable = false)
	private String userId;

	@Column(nullable = false)
	private Integer quantity;

	@Column(nullable = false)
	private LocalDateTime reservedAt;

	@Column(nullable = false)
	private LocalDateTime expiresAt;

	@Column()
	private Boolean isReleased;

	@PrePersist
	protected void onCreate() {
		reservedAt = LocalDateTime.now();
		// Default expiration: 30 minutes from now
		expiresAt = LocalDateTime.now().plusMinutes(30);
		if (isReleased == null) {
			isReleased = false;
		}
	}
}
