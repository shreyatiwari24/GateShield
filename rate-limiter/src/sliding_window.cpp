#include "sliding_window.hpp"
#include <cmath>
#include <algorithm>

SlidingWindowCounter::SlidingWindowCounter(int max_requests, int window_seconds)
    : max_requests_(max_requests), window_seconds_(window_seconds > 0 ? window_seconds : 1) {}

RateLimitResult SlidingWindowCounter::check(const std::string& key) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Current timestamp in seconds since Unix epoch
    int64_t now_sec = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    // Start of the discrete window interval
    int64_t current_window = (now_sec / window_seconds_) * window_seconds_;

    auto it = windows_.find(key);
    if (it == windows_.end()) {
        WindowState state;
        state.curr_window_start = current_window;
        state.prev_count = 0;
        state.curr_count = 0;
        it = windows_.emplace(key, state).first;
    } else {
        int64_t diff = current_window - it->second.curr_window_start;
        if (diff == window_seconds_) {
            // Moved forward by exactly 1 window: slide current count into previous
            it->second.prev_count = it->second.curr_count;
            it->second.curr_count = 0;
            it->second.curr_window_start = current_window;
        } else if (diff > window_seconds_) {
            // Moved forward by 2 or more windows: previous window had 0 requests
            it->second.prev_count = 0;
            it->second.curr_count = 0;
            it->second.curr_window_start = current_window;
        } else if (diff < 0) {
            // Clock skew fallback
            it->second.prev_count = 0;
            it->second.curr_count = 0;
            it->second.curr_window_start = current_window;
        }
    }

    // Elapsed time into the current window
    double elapsed = static_cast<double>(now_sec - it->second.curr_window_start);

    // Weight of previous window decreases as elapsed time into current window increases
    double weight = (static_cast<double>(window_seconds_) - elapsed) / static_cast<double>(window_seconds_);
    weight = std::max(0.0, std::min(1.0, weight));

    // Estimated number of requests in the sliding window
    double estimated = (it->second.prev_count * weight) + it->second.curr_count;

    RateLimitResult result;

    if (estimated < max_requests_) {
        it->second.curr_count++;
        result.allowed = true;
        result.remaining = std::max(0, static_cast<int>(std::floor(max_requests_ - estimated - 1.0)));
        result.retry_after = 0;
    } else {
        result.allowed = false;
        result.remaining = 0;
        // Estimate when the oldest requests in the sliding window will expire
        int64_t retry = static_cast<int64_t>(std::ceil(window_seconds_ - elapsed));
        result.retry_after = static_cast<int>(std::max<int64_t>(1, retry));
    }

    return result;
}
