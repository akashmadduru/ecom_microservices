package com.ecom.inventory.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "inventory")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Inventory {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true)
	private Long productId;

	@Column(nullable = false)
	private Integer availableStock;

	@Column(nullable = false)
	private Integer reservedStock;

	@Column()
	private LocalDateTime lastUpdated;

	@PrePersist
	protected void onCreate() {
		lastUpdated = LocalDateTime.now();
		if (reservedStock == null) {
			reservedStock = 0;
		}
	}

	@PreUpdate
	protected void onUpdate() {
		lastUpdated = LocalDateTime.now();
	}
}
