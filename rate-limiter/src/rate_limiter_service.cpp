#include "rate_limiter_service.hpp"
#include <iostream>

RateLimiterService::RateLimiterService(const std::string& redis_host, int redis_port)
    : redis_client_(std::make_shared<RedisClient>(redis_host, redis_port)) {}

RateLimiterService::RateLimiterService(std::shared_ptr<RedisClient> redis_client)
    : redis_client_(std::move(redis_client)) {}

RateLimitResult RateLimiterService::check(const std::string& client_id,
                                          const std::string& route,
                                          const std::string& algorithm,
                                          int max_requests,
                                          int window_seconds,
                                          int bucket_capacity,
                                          double refill_rate) {
    if (!redis_client_) {
        std::cerr << "[RateLimiterService] Redis client is null; failing open" << std::endl;
        RateLimitResult fail_open;
        fail_open.allowed = true;
        fail_open.remaining = 1;
        fail_open.retry_after = 0;
        return fail_open;
    }

    // Compose a unique namespaced key for the rate-limiting entity
    std::string key = "ratelimit:" + client_id + ":" + route;

    // Dispatch to the requested rate-limiting algorithm
    if (algorithm == "token_bucket") {
        return redis_client_->checkTokenBucket(key, bucket_capacity, refill_rate);
    } else if (algorithm == "fixed_window") {
        return redis_client_->checkFixedWindow(key, max_requests, window_seconds);
    } else if (algorithm == "sliding_window") {
        return redis_client_->checkSlidingWindow(key, max_requests, window_seconds);
    } else {
        std::cerr << "[RateLimiterService] Unknown algorithm '" << algorithm 
                  << "'; defaulting to token_bucket" << std::endl;
        return redis_client_->checkTokenBucket(key, bucket_capacity, refill_rate);
    }
}

bool RateLimiterService::isHealthy() const {
    return redis_client_ && redis_client_->isConnected();
}
