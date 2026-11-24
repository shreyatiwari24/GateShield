#include <gtest/gtest.h>
#include "token_bucket.hpp"
#include "fixed_window.hpp"
#include "sliding_window.hpp"
#include <thread>
#include <chrono>

// ============================================================================
// Token Bucket Algorithm Unit Tests
// ============================================================================

TEST(TokenBucketTest, AllowsUpToCapacityThenRejects) {
    // Capacity 3, refill rate 0.5 tokens/sec
    TokenBucket bucket(3, 0.5);
    std::string key = "client_tb_1";

    // First request: should consume 1 token, 2 remaining
    RateLimitResult res1 = bucket.check(key);
    EXPECT_TRUE(res1.allowed);
    EXPECT_EQ(res1.remaining, 2);
    EXPECT_EQ(res1.retry_after, 0);

    // Second request: 1 remaining
    RateLimitResult res2 = bucket.check(key);
    EXPECT_TRUE(res2.allowed);
    EXPECT_EQ(res2.remaining, 1);
    EXPECT_EQ(res2.retry_after, 0);

    // Third request: 0 remaining
    RateLimitResult res3 = bucket.check(key);
    EXPECT_TRUE(res3.allowed);
    EXPECT_EQ(res3.remaining, 0);
    EXPECT_EQ(res3.retry_after, 0);

    // Fourth request: bucket empty, should reject
    RateLimitResult res4 = bucket.check(key);
    EXPECT_FALSE(res4.allowed);
    EXPECT_EQ(res4.remaining, 0);
    EXPECT_GE(res4.retry_after, 1);
}

TEST(TokenBucketTest, RefillsTokensAfterWait) {
    // Capacity 2, refill rate 10 tokens/sec (1 token every 100ms)
    TokenBucket bucket(2, 10.0);
    std::string key = "client_tb_refill";

    // Exhaust initial tokens
    EXPECT_TRUE(bucket.check(key).allowed);
    EXPECT_TRUE(bucket.check(key).allowed);
    EXPECT_FALSE(bucket.check(key).allowed);

    // Wait 250ms -> should refill at least 2 tokens (capped at capacity 2)
    std::this_thread::sleep_for(std::chrono::milliseconds(250));

    // Request should now be allowed
    RateLimitResult res = bucket.check(key);
    EXPECT_TRUE(res.allowed);
}

TEST(TokenBucketTest, IndependentKeysDoNotInterfere) {
    TokenBucket bucket(1, 1.0);

    // Exhaust client A
    EXPECT_TRUE(bucket.check("client_A").allowed);
    EXPECT_FALSE(bucket.check("client_A").allowed);

    // Client B should still have full quota
    EXPECT_TRUE(bucket.check("client_B").allowed);
    EXPECT_FALSE(bucket.check("client_B").allowed);
}

// ============================================================================
// Fixed Window Algorithm Unit Tests
// ============================================================================

TEST(FixedWindowTest, AllowsUpToMaxThenRejects) {
    // 3 requests allowed per 60 second window
    FixedWindow limiter(3, 60);
    std::string key = "client_fw_1";

    RateLimitResult r1 = limiter.check(key);
    EXPECT_TRUE(r1.allowed);
    EXPECT_EQ(r1.remaining, 2);
    EXPECT_EQ(r1.retry_after, 0);

    RateLimitResult r2 = limiter.check(key);
    EXPECT_TRUE(r2.allowed);
    EXPECT_EQ(r2.remaining, 1);
    EXPECT_EQ(r2.retry_after, 0);

    RateLimitResult r3 = limiter.check(key);
    EXPECT_TRUE(r3.allowed);
    EXPECT_EQ(r3.remaining, 0);
    EXPECT_EQ(r3.retry_after, 0);

    // 4th request in the same window should be rejected
    RateLimitResult r4 = limiter.check(key);
    EXPECT_FALSE(r4.allowed);
    EXPECT_EQ(r4.remaining, 0);
    EXPECT_GE(r4.retry_after, 1);
    EXPECT_LE(r4.retry_after, 60);
}

TEST(FixedWindowTest, IndependentKeysHaveSeparateQuotas) {
    FixedWindow limiter(2, 30);

    EXPECT_TRUE(limiter.check("user_1").allowed);
    EXPECT_TRUE(limiter.check("user_1").allowed);
    EXPECT_FALSE(limiter.check("user_1").allowed);

    // user_2 quota is untouched
    EXPECT_TRUE(limiter.check("user_2").allowed);
    EXPECT_TRUE(limiter.check("user_2").allowed);
    EXPECT_FALSE(limiter.check("user_2").allowed);
}

TEST(FixedWindowTest, SingleRequestWindow) {
    FixedWindow limiter(1, 10);
    std::string key = "single_req";

    EXPECT_TRUE(limiter.check(key).allowed);
    EXPECT_FALSE(limiter.check(key).allowed);
}

// ============================================================================
// Sliding Window Counter Unit Tests
// ============================================================================

TEST(SlidingWindowTest, BasicAllowAndReject) {
    // Max 3 requests per 60 second window
    SlidingWindowCounter limiter(3, 60);
    std::string key = "client_sw_1";

    RateLimitResult r1 = limiter.check(key);
    EXPECT_TRUE(r1.allowed);
    EXPECT_EQ(r1.remaining, 2);

    RateLimitResult r2 = limiter.check(key);
    EXPECT_TRUE(r2.allowed);
    EXPECT_EQ(r2.remaining, 1);

    RateLimitResult r3 = limiter.check(key);
    EXPECT_TRUE(r3.allowed);
    EXPECT_EQ(r3.remaining, 0);

    // 4th request exceeds estimated quota
    RateLimitResult r4 = limiter.check(key);
    EXPECT_FALSE(r4.allowed);
    EXPECT_EQ(r4.remaining, 0);
    EXPECT_GE(r4.retry_after, 1);
}

TEST(SlidingWindowTest, IndependentKeys) {
    SlidingWindowCounter limiter(2, 60);

    EXPECT_TRUE(limiter.check("alice").allowed);
    EXPECT_TRUE(limiter.check("alice").allowed);
    EXPECT_FALSE(limiter.check("alice").allowed);

    // Bob has his own window
    EXPECT_TRUE(limiter.check("bob").allowed);
    EXPECT_TRUE(limiter.check("bob").allowed);
    EXPECT_FALSE(limiter.check("bob").allowed);
}

TEST(SlidingWindowTest, HigherCapacityConfiguration) {
    // High capacity configuration: 10 requests allowed
    SlidingWindowCounter limiter(10, 30);
    std::string key = "high_cap_client";

    for (int i = 0; i < 10; ++i) {
        RateLimitResult res = limiter.check(key);
        EXPECT_TRUE(res.allowed);
        EXPECT_EQ(res.remaining, 10 - i - 1);
    }

    // 11th request must be rejected
    RateLimitResult rejected = limiter.check(key);
    EXPECT_FALSE(rejected.allowed);
    EXPECT_EQ(rejected.remaining, 0);
    EXPECT_GE(rejected.retry_after, 1);
}
