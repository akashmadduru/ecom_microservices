package com.ecom.inventory.exception;

import lombok.Builder;
import lombok.Data;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import java.time.LocalDateTime;

@ControllerAdvice
public class GlobalExceptionHandler {

	@ExceptionHandler(InventoryNotFoundException.class)
	public ResponseEntity<ErrorResponse> handleInventoryNotFoundException(InventoryNotFoundException ex) {
		ErrorResponse error = ErrorResponse.builder()
				.message(ex.getMessage())
				.status(HttpStatus.NOT_FOUND.value())
				.timestamp(LocalDateTime.now())
				.build();
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
	}

	@ExceptionHandler(OutOfStockException.class)
	public ResponseEntity<ErrorResponse> handleOutOfStockException(OutOfStockException ex) {
		ErrorResponse error = ErrorResponse.builder()
				.message(ex.getMessage())
				.status(HttpStatus.CONFLICT.value())
				.timestamp(LocalDateTime.now())
				.build();
		return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
		ErrorResponse error = ErrorResponse.builder()
				.message("An unexpected error occurred: " + ex.getMessage())
				.status(HttpStatus.INTERNAL_SERVER_ERROR.value())
				.timestamp(LocalDateTime.now())
				.build();
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
	}

	@Data
	@Builder
	static class ErrorResponse {
		private String message;
		private int status;
		private LocalDateTime timestamp;
	}
}
