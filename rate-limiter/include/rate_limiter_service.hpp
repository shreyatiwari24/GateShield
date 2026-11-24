#pragma once

#include <string>
#include <memory>
#include "redis_client.hpp"

// Shared RateLimitResult struct
#ifndef RATE_LIMIT_RESULT_DEFINED
#define RATE_LIMIT_RESULT_DEFINED
struct RateLimitResult {
    bool allowed{true};
    int remaining{0};
    int retry_after{0};
};
#endif

/**
 * @brief High-level service coordinating rate limit checks across algorithms.
 * 
 * Wraps RedisClient and dispatches requests to the appropriate distributed algorithm
 * based on the provided algorithm name ("token_bucket", "fixed_window", "sliding_window").
 */
class RateLimiterService {
public:
    /**
     * @brief Constructs service by instantiating and connecting an internal RedisClient.
     * @param redis_host Hostname of Redis server.
     * @param redis_port Port of Redis server.
     */
    RateLimiterService(const std::string& redis_host, int redis_port);

    /**
     * @brief Constructs service with a shared RedisClient instance (useful for testing or pooling).
     */
    explicit RateLimiterService(std::shared_ptr<RedisClient> redis_client);

    /**
     * @brief Evaluates a rate limit request for a given client and route.
     * 
     * @param client_id Unique identifier for the client (e.g. IP or API key).
     * @param route Target HTTP route/path (e.g. "/api/v1/orders").
     * @param algorithm Algorithm to apply ("token_bucket", "fixed_window", "sliding_window").
     * @param max_requests Quota for window-based algorithms.
     * @param window_seconds Window length for window-based algorithms.
     * @param bucket_capacity Capacity for token bucket algorithm.
     * @param refill_rate Refill rate (tokens/sec) for token bucket algorithm.
     * @return RateLimitResult containing allowed status, remaining tokens, and retry_after in seconds.
     */
    RateLimitResult check(const std::string& client_id,
                          const std::string& route,
                          const std::string& algorithm,
                          int max_requests,
                          int window_seconds,
                          int bucket_capacity,
                          double refill_rate);

    /**
     * @brief Health check for Redis connectivity.
     */
    bool isHealthy() const;

private:
    std::shared_ptr<RedisClient> redis_client_;
};
