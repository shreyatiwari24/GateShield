#pragma once

#include <string>
#include <unordered_map>
#include <mutex>
#include <chrono>
#include <cstdint>

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
 * @brief SlidingWindowCounter rate-limiting algorithm (In-Memory).
 * 
 * Logic:
 * - Solves the boundary-burst issue of Fixed Window by weighting previous window's requests.
 * - Approximates sliding request count:
 *   estimated = prev_count * ((window_seconds - elapsed) / window_seconds) + curr_count
 * - If estimated < max_requests, request is allowed and curr_count increments.
 * - If estimated >= max_requests, request is rejected with estimated retry_after.
 */
class SlidingWindowCounter {
public:
    /**
     * @param max_requests Maximum allowed requests within the sliding window.
     * @param window_seconds Length of the window in seconds.
     */
    SlidingWindowCounter(int max_requests, int window_seconds);

    /**
     * @brief Checks if a request for the given key is allowed.
     * @param key Identifier for the rate-limited client or route.
     * @return RateLimitResult containing allowed status, remaining quota, and retry_after.
     */
    RateLimitResult check(const std::string& key);

private:
    struct WindowState {
        int64_t curr_window_start{0};
        int prev_count{0};
        int curr_count{0};
    };

    int max_requests_;
    int window_seconds_;
    std::unordered_map<std::string, WindowState> windows_;
    std::mutex mutex_;
};
