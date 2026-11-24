#pragma once

#include <string>
#include <mutex>
#include <vector>

// Shared RateLimitResult struct
#ifndef RATE_LIMIT_RESULT_DEFINED
#define RATE_LIMIT_RESULT_DEFINED
struct RateLimitResult {
    bool allowed{true};
    int remaining{0};
    int retry_after{0};
};
#endif

// Hiredis C library include
extern "C" {
#if __has_include(<hiredis/hiredis.h>)
#include <hiredis/hiredis.h>
#elif __has_include(<hiredis.h>)
#include <hiredis.h>
#else
#include <hiredis/hiredis.h>
#endif
}

/**
 * @brief Thread-safe Redis client interface using hiredis.
 * 
 * Executes atomic Lua scripts for:
 * 1. Token Bucket
 * 2. Fixed Window
 * 3. Sliding Window Counter
 * 
 * Implements a fail-open strategy: if Redis is unavailable or fails,
 * requests are allowed to proceed to prevent cascading outages.
 */
class RedisClient {
public:
    /**
     * @param host Redis server hostname or IP address.
     * @param port Redis server port (typically 6379).
     */
    RedisClient(const std::string& host, int port);
    ~RedisClient();

    // Disable copying due to managed redisContext pointer
    RedisClient(const RedisClient&) = delete;
    RedisClient& operator=(const RedisClient&) = delete;

    /**
     * @brief Connects to the Redis server.
     * @return true if connected successfully, false otherwise.
     */
    bool connect();

    /**
     * @brief Disconnects and frees the redisContext.
     */
    void disconnect();

    /**
     * @brief Checks if currently connected to Redis.
     */
    bool isConnected() const {
        return context_ != nullptr && context_->err == 0;
    }

    /**
     * @brief Atomically evaluates token_bucket.lua in Redis.
     */
    RateLimitResult checkTokenBucket(const std::string& key, int capacity, double refill_rate);

    /**
     * @brief Atomically evaluates fixed_window.lua in Redis.
     */
    RateLimitResult checkFixedWindow(const std::string& key, int max_requests, int window_seconds);

    /**
     * @brief Atomically evaluates sliding_window.lua in Redis.
     */
    RateLimitResult checkSlidingWindow(const std::string& key, int max_requests, int window_seconds);

    /**
     * @brief Helper to load a Lua script file from disk.
     * Searches common directories (lua/, ./lua/, /app/lua/).
     */
    std::string loadScript(const std::string& filename);

private:
    std::string host_;
    int port_;
    redisContext* context_{nullptr};
    mutable std::mutex mutex_;

    // Cached script contents
    std::string token_bucket_script_;
    std::string fixed_window_script_;
    std::string sliding_window_script_;

    /**
     * @brief Helper to parse Redis array reply from Lua script into RateLimitResult.
     */
    RateLimitResult parseRedisReply(redisReply* reply);
};
