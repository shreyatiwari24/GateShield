#include "fixed_window.hpp"
#include <algorithm>

FixedWindow::FixedWindow(int max_requests, int window_seconds)
    : max_requests_(max_requests), window_seconds_(window_seconds > 0 ? window_seconds : 1) {}

RateLimitResult FixedWindow::check(const std::string& key) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Get current time in seconds since Unix epoch
    int64_t now_sec = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    // Fixed window start = floor(now / window_seconds) * window_seconds
    int64_t current_window = (now_sec / window_seconds_) * window_seconds_;

    auto it = windows_.find(key);
    if (it == windows_.end()) {
        WindowState state;
        state.window_start = current_window;
        state.count = 0;
        it = windows_.emplace(key, state).first;
    } else if (it->second.window_start != current_window) {
        // Window has rolled over to a new interval; reset count
        it->second.window_start = current_window;
        it->second.count = 0;
    }

    RateLimitResult result;

    if (it->second.count < max_requests_) {
        // Request accepted within current window quota
        it->second.count++;
        result.allowed = true;
        result.remaining = max_requests_ - it->second.count;
        result.retry_after = 0;
    } else {
        // Window quota exceeded: retry after current window closes
        result.allowed = false;
        result.remaining = 0;
        int64_t retry = (it->second.window_start + window_seconds_) - now_sec;
        result.retry_after = static_cast<int>(std::max<int64_t>(1, retry));
    }

    return result;
}
