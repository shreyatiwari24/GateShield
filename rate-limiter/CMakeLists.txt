cmake_minimum_required(VERSION 3.14)
project(gateshield-rate-limiter VERSION 1.0 LANGUAGES CXX)

# C++17 standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ---- Dependencies ----
# Crow (header-only HTTP framework) - fetched automatically
include(FetchContent)

FetchContent_Declare(
    crow
    GIT_REPOSITORY https://github.com/CrowCpp/Crow.git
    GIT_TAG v1.3.4
)
FetchContent_MakeAvailable(crow)

# hiredis (Redis C client)
find_package(PkgConfig REQUIRED)
pkg_check_modules(HIREDIS REQUIRED hiredis)

# ---- Main executable ----
add_executable(rate_limiter
    src/main.cpp
    src/token_bucket.cpp
    src/fixed_window.cpp
    src/sliding_window.cpp
    src/rate_limiter_service.cpp
    src/redis_client.cpp
)

target_include_directories(rate_limiter PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${HIREDIS_INCLUDE_DIRS}
)

target_link_libraries(rate_limiter PRIVATE
    Crow::Crow
    ${HIREDIS_LIBRARIES}
    pthread
)

# ---- Tests ----
option(BUILD_TESTS "Build unit tests" ON)

if(BUILD_TESTS)
    FetchContent_Declare(
        googletest
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG v1.14.0
    )
    FetchContent_MakeAvailable(googletest)

    enable_testing()

    add_executable(test_algorithms
        tests/test_algorithms.cpp
        src/token_bucket.cpp
        src/fixed_window.cpp
        src/sliding_window.cpp
    )

    target_include_directories(test_algorithms PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
    )

    target_link_libraries(test_algorithms PRIVATE
        GTest::gtest_main
    )

    include(GoogleTest)
    gtest_discover_tests(test_algorithms)
endif()
