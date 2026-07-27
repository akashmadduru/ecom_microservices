package com.ecom.product.exception;

import com.ecom.common.exception.ConflictException;
import com.ecom.common.exception.ForbiddenException;
import com.ecom.common.exception.NotFoundException;
import com.ecom.common.exception.ValidationException;
import com.ecom.product.dto.ErrorResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GlobalExceptionHandlerTest: Unit tests for exception handling.
 *
 * Tests:
 * - Exception mapping to HTTP status codes
 * - Error response format
 */
@WebMvcTest(TestExceptionController.class)
@ActiveProfiles("test")
@DisplayName("GlobalExceptionHandler Tests")
class GlobalExceptionHandlerTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("Should map NotFoundException to 404")
    void testNotFoundExceptionMapping() throws Exception {
        mockMvc.perform(get("/test/not-found")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.error.message").value("Product not found"));
    }

    @Test
    @DisplayName("Should map ConflictException to 409")
    void testConflictExceptionMapping() throws Exception {
        mockMvc.perform(get("/test/conflict")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CONFLICT"))
                .andExpect(jsonPath("$.error.message").value("Duplicate slug"));
    }

    @Test
    @DisplayName("Should map ValidationException to 422")
    void testValidationExceptionMapping() throws Exception {
        mockMvc.perform(get("/test/validation")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.message").value("Invalid title"));
    }

    @Test
    @DisplayName("Should map ForbiddenException to 403")
    void testForbiddenExceptionMapping() throws Exception {
        mockMvc.perform(get("/test/forbidden")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"))
                .andExpect(jsonPath("$.error.message").value("Access denied"));
    }

    /**
     * Test controller for exception testing.
     */
    @RestController
    public static class TestExceptionController {
        @GetMapping("/test/not-found")
        public void throwNotFound() {
            throw new NotFoundException("Product not found");
        }

        @GetMapping("/test/conflict")
        public void throwConflict() {
            throw new ConflictException("Duplicate slug");
        }

        @GetMapping("/test/validation")
        public void throwValidation() {
            throw new ValidationException("Invalid title");
        }

        @GetMapping("/test/forbidden")
        public void throwForbidden() {
            throw new ForbiddenException("Access denied");
        }
    }
}
