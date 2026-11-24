#pragma once

#include <string>
#include <unordered_map>
#include <mutex>
#include <chrono>

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
 * @brief TokenBucket rate-limiting algorithm (In-Memory).
 * 
 * Logic:
 * - A bucket holds a maximum number of tokens (capacity).
 * - Tokens are continuously refilled at a constant rate (refill_rate tokens/sec).
 * - Each incoming request consumes 1 token.
 * - If tokens >= 1, the request is allowed.
 * - If tokens < 1, the request is rejected and retry_after indicates the seconds
 *   until at least 1 token is available.
 */
class TokenBucket {
public:
    /**
     * @param capacity Maximum number of tokens the bucket can hold.
     * @param refill_rate Number of tokens added per second.
     */
    TokenBucket(int capacity, double refill_rate);

    /**
     * @brief Checks if a request for the given key is allowed.
     * @param key Identifier for the rate-limited client or route.
     * @return RateLimitResult containing allowed status, remaining tokens, and retry_after.
     */
    RateLimitResult check(const std::string& key);

private:
    struct BucketState {
        double tokens;
        std::chrono::steady_clock::time_point last_refill;
    };

    int capacity_;
    double refill_rate_;
    std::unordered_map<std::string, BucketState> buckets_;
    std::mutex mutex_;
};
