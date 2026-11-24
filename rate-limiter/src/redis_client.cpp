#include "redis_client.hpp"
#include <fstream>
#include <sstream>
#include <iostream>
#include <chrono>

namespace {
// Fallback Lua scripts in case files are missing or path is not resolved
const char* FALLBACK_TOKEN_BUCKET = 
R"(local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1]) or capacity
local last_refill = tonumber(data[2]) or now
local elapsed = now - last_refill
tokens = math.min(capacity, tokens + elapsed * refill_rate)
if tokens >= 1 then
    tokens = tokens - 1
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
    redis.call('EXPIRE', key, math.ceil(capacity / refill_rate) + 10)
    return {1, math.floor(tokens), 0}
else
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
    redis.call('EXPIRE', key, math.ceil(capacity / refill_rate) + 10)
    local retry = math.ceil((1 - tokens) / refill_rate)
    return {0, 0, retry}
end)";

const char* FALLBACK_FIXED_WINDOW = 
R"(local key = KEYS[1]
local max_req = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local window_start = math.floor(now / window) * window
local window_key = key .. ':' .. window_start
local count = tonumber(redis.call('GET', window_key)) or 0
if count < max_req then
    redis.call('INCR', window_key)
    redis.call('EXPIRE', window_key, window + 1)
    return {1, max_req - count - 1, 0}
else
    local retry = window_start + window - now
    return {0, 0, math.ceil(retry)}
end)";

const char* FALLBACK_SLIDING_WINDOW = 
R"(local key = KEYS[1]
local max_req = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local curr_window = math.floor(now / window) * window
local prev_window = curr_window - window
local curr_key = key .. ':' .. curr_window
local prev_key = key .. ':' .. prev_window
local curr_count = tonumber(redis.call('GET', curr_key)) or 0
local prev_count = tonumber(redis.call('GET', prev_key)) or 0
local elapsed = now - curr_window
local weight = (window - elapsed) / window
local estimated = prev_count * weight + curr_count
if estimated < max_req then
    redis.call('INCR', curr_key)
    redis.call('EXPIRE', curr_key, window * 2 + 1)
    return {1, math.floor(max_req - estimated - 1), 0}
else
    local retry = math.ceil(window - elapsed)
    return {0, 0, retry}
end)";
} // anonymous namespace

RedisClient::RedisClient(const std::string& host, int port)
    : host_(host), port_(port), context_(nullptr) {
    connect();
}

RedisClient::~RedisClient() {
    disconnect();
}

bool RedisClient::connect() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (context_ != nullptr) {
        redisFree(context_);
        context_ = nullptr;
    }

    struct timeval timeout = {1, 500000}; // 1.5 seconds timeout
    context_ = redisConnectWithTimeout(host_.c_str(), port_, timeout);
    if (context_ == nullptr || context_->err) {
        if (context_) {
            std::cerr << "[RedisClient] Connection error to " << host_ << ":" << port_ 
                      << " - " << context_->errstr << std::endl;
            redisFree(context_);
            context_ = nullptr;
        } else {
            std::cerr << "[RedisClient] Failed to allocate Redis context for " 
                      << host_ << ":" << port_ << std::endl;
        }
        return false;
    }
    std::cout << "[RedisClient] Connected to Redis at " << host_ << ":" << port_ << std::endl;
    return true;
}

void RedisClient::disconnect() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (context_ != nullptr) {
        redisFree(context_);
        context_ = nullptr;
        std::cout << "[RedisClient] Disconnected from Redis" << std::endl;
    }
}

std::string RedisClient::loadScript(const std::string& filename) {
    // List candidate directories to locate the Lua scripts
    std::vector<std::string> search_paths = {
        filename,
        "lua/" + filename,
        "./lua/" + filename,
        "/app/lua/" + filename,
        "../lua/" + filename
    };

    for (const auto& path : search_paths) {
        std::ifstream file(path);
        if (file.is_open()) {
            std::stringstream buffer;
            buffer << file.rdbuf();
            std::string content = buffer.str();
            if (!content.empty()) {
                return content;
            }
        }
    }
    return "";
}

RateLimitResult RedisClient::parseRedisReply(redisReply* reply) {
    RateLimitResult result;

    if (!reply) {
        std::cerr << "[RedisClient] Null reply from Redis; executing fail-open policy" << std::endl;
        result.allowed = true;
        result.remaining = 1;
        result.retry_after = 0;
        return result;
    }

    if (reply->type == REDIS_REPLY_ERROR) {
        std::cerr << "[RedisClient] Redis script error: " 
                  << (reply->str ? reply->str : "unknown") 
                  << "; failing open" << std::endl;
        result.allowed = true;
        result.remaining = 1;
        result.retry_after = 0;
        return result;
    }

    // Lua scripts return a 3-element array: {allowed, remaining, retry_after}
    if (reply->type == REDIS_REPLY_ARRAY && reply->elements >= 3) {
        auto extract_int = [](redisReply* el) -> int {
            if (!el) return 0;
            if (el->type == REDIS_REPLY_INTEGER) {
                return static_cast<int>(el->integer);
            }
            if (el->type == REDIS_REPLY_STRING && el->str) {
                try {
                    return std::stoi(el->str);
                } catch (...) {
                    return 0;
                }
            }
            return 0;
        };

        int allowed_flag = extract_int(reply->element[0]);
        result.allowed = (allowed_flag == 1);
        result.remaining = extract_int(reply->element[1]);
        result.retry_after = extract_int(reply->element[2]);
    } else {
        std::cerr << "[RedisClient] Unexpected Redis reply type: " << reply->type 
                  << "; failing open" << std::endl;
        result.allowed = true;
        result.remaining = 1;
        result.retry_after = 0;
    }

    return result;
}

RateLimitResult RedisClient::checkTokenBucket(const std::string& key, int capacity, double refill_rate) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Auto-reconnect if connection was dropped
    if (!isConnected()) {
        struct timeval timeout = {1, 500000};
        context_ = redisConnectWithTimeout(host_.c_str(), port_, timeout);
        if (!isConnected()) {
            std::cerr << "[RedisClient] Redis unreachable; fail-open" << std::endl;
            RateLimitResult fail_open;
            fail_open.allowed = true;
            fail_open.remaining = 1;
            fail_open.retry_after = 0;
            return fail_open;
        }
    }

    if (token_bucket_script_.empty()) {
        token_bucket_script_ = loadScript("token_bucket.lua");
        if (token_bucket_script_.empty()) {
            token_bucket_script_ = FALLBACK_TOKEN_BUCKET;
        }
    }

    int64_t now_sec = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    std::string capacity_str = std::to_string(capacity);
    std::string refill_rate_str = std::to_string(refill_rate);
    std::string now_str = std::to_string(now_sec);

    redisReply* reply = static_cast<redisReply*>(
        redisCommand(context_, "EVAL %s 1 %s %s %s %s",
                     token_bucket_script_.c_str(),
                     key.c_str(),
                     capacity_str.c_str(),
                     refill_rate_str.c_str(),
                     now_str.c_str())
    );

    RateLimitResult result = parseRedisReply(reply);
    if (reply) {
        freeReplyObject(reply);
    }
    return result;
}

RateLimitResult RedisClient::checkFixedWindow(const std::string& key, int max_requests, int window_seconds) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!isConnected()) {
        struct timeval timeout = {1, 500000};
        context_ = redisConnectWithTimeout(host_.c_str(), port_, timeout);
        if (!isConnected()) {
            std::cerr << "[RedisClient] Redis unreachable; fail-open" << std::endl;
            RateLimitResult fail_open;
            fail_open.allowed = true;
            fail_open.remaining = 1;
            fail_open.retry_after = 0;
            return fail_open;
        }
    }

    if (fixed_window_script_.empty()) {
        fixed_window_script_ = loadScript("fixed_window.lua");
        if (fixed_window_script_.empty()) {
            fixed_window_script_ = FALLBACK_FIXED_WINDOW;
        }
    }

    int64_t now_sec = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    std::string max_req_str = std::to_string(max_requests);
    std::string window_str = std::to_string(window_seconds);
    std::string now_str = std::to_string(now_sec);

    redisReply* reply = static_cast<redisReply*>(
        redisCommand(context_, "EVAL %s 1 %s %s %s %s",
                     fixed_window_script_.c_str(),
                     key.c_str(),
                     max_req_str.c_str(),
                     window_str.c_str(),
                     now_str.c_str())
    );

    RateLimitResult result = parseRedisReply(reply);
    if (reply) {
        freeReplyObject(reply);
    }
    return result;
}

RateLimitResult RedisClient::checkSlidingWindow(const std::string& key, int max_requests, int window_seconds) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!isConnected()) {
        struct timeval timeout = {1, 500000};
        context_ = redisConnectWithTimeout(host_.c_str(), port_, timeout);
        if (!isConnected()) {
            std::cerr << "[RedisClient] Redis unreachable; fail-open" << std::endl;
            RateLimitResult fail_open;
            fail_open.allowed = true;
            fail_open.remaining = 1;
            fail_open.retry_after = 0;
            return fail_open;
        }
    }

    if (sliding_window_script_.empty()) {
        sliding_window_script_ = loadScript("sliding_window.lua");
        if (sliding_window_script_.empty()) {
            sliding_window_script_ = FALLBACK_SLIDING_WINDOW;
        }
    }

    int64_t now_sec = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    std::string max_req_str = std::to_string(max_requests);
    std::string window_str = std::to_string(window_seconds);
    std::string now_str = std::to_string(now_sec);

    redisReply* reply = static_cast<redisReply*>(
        redisCommand(context_, "EVAL %s 1 %s %s %s %s",
                     sliding_window_script_.c_str(),
                     key.c_str(),
                     max_req_str.c_str(),
                     window_str.c_str(),
                     now_str.c_str())
    );

    RateLimitResult result = parseRedisReply(reply);
    if (reply) {
        freeReplyObject(reply);
    }
    return result;
}
