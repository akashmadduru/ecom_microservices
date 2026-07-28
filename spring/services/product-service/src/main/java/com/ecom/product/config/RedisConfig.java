package com.ecom.product.config;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
//import org.springframework.data.redis.serialization.RedisSerializationContext;
//import org.springframework.data.redis.serialization.StringRedisSerializer;

import java.time.Duration;

/**
 * RedisConfig: Redis caching configuration.
 *
 * Configures:
 * - Cache manager with TTL-based invalidation
 * - Serialization for caching
 * - Cache name prefixes for different cache types
 */
@Configuration
@EnableCaching
public class RedisConfig {

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofHours(1)) // Default 1 hour TTL
//                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
//                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .disableCachingNullValues();

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(config)
                // Cache-specific configurations
                .withCacheConfiguration("products", config.entryTtl(Duration.ofHours(1)))
                .withCacheConfiguration("products:search", config.entryTtl(Duration.ofMinutes(30)))
                .withCacheConfiguration("products:fulltext", config.entryTtl(Duration.ofMinutes(30)))
                .withCacheConfiguration("brands", config.entryTtl(Duration.ofHours(2)))
                .withCacheConfiguration("categories", config.entryTtl(Duration.ofHours(2)))
                .withCacheConfiguration("collections", config.entryTtl(Duration.ofHours(1)))
                .build();
    }
}
