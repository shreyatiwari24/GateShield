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
 * @brief FixedWindow rate-limiting algorithm (In-Memory).
 * 
 * Logic:
 * - Time is divided into discrete, fixed windows of duration window_seconds.
 * - Window start is computed as: floor(now / window_seconds) * window_seconds.
 * - Each request within the current window increments a counter.
 * - If count <= max_requests, the request is allowed.
 * - When the window expires, the counter resets.
 * - If count exceeds max_requests, retry_after is the remaining seconds in the window.
 */
class FixedWindow {
public:
    /**
     * @param max_requests Maximum allowed requests within a single window.
     * @param window_seconds Length of each fixed window in seconds.
     */
    FixedWindow(int max_requests, int window_seconds);

    /**
     * @brief Checks if a request for the given key is allowed.
     * @param key Identifier for the rate-limited client or route.
     * @return RateLimitResult containing allowed status, remaining quota, and retry_after.
     */
    RateLimitResult check(const std::string& key);

private:
    struct WindowState {
        int64_t window_start{0};
        int count{0};
    };

    int max_requests_;
    int window_seconds_;
    std::unordered_map<std::string, WindowState> windows_;
    std::mutex mutex_;
};
