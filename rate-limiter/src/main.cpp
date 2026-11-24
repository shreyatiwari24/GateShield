#include "crow.h"
#include "rate_limiter_service.hpp"
#include <cstdlib>
#include <iostream>
#include <string>

int main()
{
    // Read configuration from environment variables with sensible defaults
    const char *redis_host_env = std::getenv("REDIS_HOST");
    const char *redis_port_env = std::getenv("REDIS_PORT");
    const char *port_env = std::getenv("RATE_LIMITER_PORT");

    std::string redis_host = (redis_host_env != nullptr) ? redis_host_env : "127.0.0.1";
    int redis_port = (redis_port_env != nullptr) ? std::stoi(redis_port_env) : 6379;
    int port = (port_env != nullptr) ? std::stoi(port_env) : 8081;

    std::cout << "[GateShield Rate Limiter] Connecting to Redis at "
              << redis_host << ":" << redis_port << std::endl;

    // Initialize rate limiter service
    RateLimiterService service(redis_host, redis_port);

    crow::SimpleApp app;

    // GET /health - Service health check
    CROW_ROUTE(app, "/health").methods(crow::HTTPMethod::GET)([&service]()
                                                              {
        crow::json::wvalue res;
        res["status"] = "ok";
        res["redis_connected"] = service.isHealthy();
        return crow::response(200, res); });

    // POST /check - Check rate limit status for client and route
    CROW_ROUTE(app, "/check").methods(crow::HTTPMethod::POST)([&service](const crow::request &req)
                                                              {
        auto json_body = crow::json::load(req.body);
        if (!json_body) {
            crow::json::wvalue err;
            err["error"] = "Invalid JSON payload";
            return crow::response(400, err);
        }

        // Extract request parameters with defaults
      std::string client_id = json_body.has("client_id") ? std::string(json_body["client_id"].s()) : "anonymous";

      std::string route = json_body.has("route") ? std::string(json_body["route"].s()) : "/";

      std::string algorithm = json_body.has("algorithm") ? std::string(json_body["algorithm"].s()) : "token_bucket";

        int max_requests = 60;
        if (json_body.has("max_requests")) {
            try {
                max_requests = static_cast<int>(json_body["max_requests"].i());
            } catch (...) {}
        }

        int window_seconds = 60;
        if (json_body.has("window_seconds")) {
            try {
                window_seconds = static_cast<int>(json_body["window_seconds"].i());
            } catch (...) {}
        }

        int bucket_capacity = 60;
        if (json_body.has("bucket_capacity")) {
            try {
                bucket_capacity = static_cast<int>(json_body["bucket_capacity"].i());
            } catch (...) {}
        }

        double refill_rate = 1.0;
        if (json_body.has("refill_rate")) {
            try {
                refill_rate = json_body["refill_rate"].d();
            } catch (...) {
                try {
                    refill_rate = static_cast<double>(json_body["refill_rate"].i());
                } catch (...) {
                    refill_rate = 1.0;
                }
            }
        }

        // Log incoming check request
        CROW_LOG_INFO << "[RateLimiter] Request received - client_id: " << client_id
                      << ", route: " << route
                      << ", algorithm: " << algorithm
                      << ", max_req: " << max_requests
                      << ", window_sec: " << window_seconds
                      << ", capacity: " << bucket_capacity
                      << ", refill_rate: " << refill_rate;

        // Execute algorithm evaluation
        RateLimitResult result = service.check(client_id,
                                               route,
                                               algorithm,
                                               max_requests,
                                               window_seconds,
                                               bucket_capacity,
                                               refill_rate);

        // Build JSON response
        crow::json::wvalue res;
        res["allowed"] = result.allowed;
        res["remaining"] = result.remaining;
        res["retry_after"] = result.retry_after;

        return crow::response(200, res); });

    CROW_LOG_INFO << "[GateShield Rate Limiter] Listening on port " << port;
    app.port(port).multithreaded().run();

    return 0;
}
