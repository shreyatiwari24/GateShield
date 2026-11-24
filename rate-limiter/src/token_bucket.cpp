#include "token_bucket.hpp"
#include <cmath>
#include <algorithm>

TokenBucket::TokenBucket(int capacity, double refill_rate)
    : capacity_(capacity), refill_rate_(refill_rate) {}

RateLimitResult TokenBucket::check(const std::string& key) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto now = std::chrono::steady_clock::now();

    // Find or initialize bucket state for this key
    auto it = buckets_.find(key);
    if (it == buckets_.end()) {
        BucketState new_state;
        new_state.tokens = static_cast<double>(capacity_);
        new_state.last_refill = now;
        it = buckets_.emplace(key, new_state).first;
    }

    // Calculate elapsed time in seconds since last refill
    std::chrono::duration<double> elapsed = now - it->second.last_refill;
    it->second.last_refill = now;

    // Add refilled tokens, capping at total capacity
    it->second.tokens = std::min(
        static_cast<double>(capacity_),
        it->second.tokens + (elapsed.count() * refill_rate_)
    );

    RateLimitResult result;

    if (it->second.tokens >= 1.0) {
        // Consume 1 token
        it->second.tokens -= 1.0;
        result.allowed = true;
        result.remaining = static_cast<int>(std::floor(it->second.tokens));
        result.retry_after = 0;
    } else {
        // Not enough tokens: compute wait time until 1 full token is refilled
        result.allowed = false;
        result.remaining = 0;
        double needed = 1.0 - it->second.tokens;
        if (refill_rate_ > 0.0) {
            result.retry_after = std::max(1, static_cast<int>(std::ceil(needed / refill_rate_)));
        } else {
            result.retry_after = 60; // Fallback if refill_rate is 0
        }
    }

    return result;
}
