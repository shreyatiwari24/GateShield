
FROM ubuntu:22.04 AS builder

RUN apt-get update && apt-get install -y \
    cmake \
    g++ \
    git \
    pkg-config \
    libhiredis-dev \
    libboost-all-dev

WORKDIR /app
COPY . .

RUN mkdir build && cd build && cmake -DBUILD_TESTS=OFF .. && make -j$(nproc)

FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    curl \
    libhiredis-dev \
    libboost-system1.74.0 \
    libboost-date-time1.74.0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/build/rate_limiter .
COPY lua/ lua/

EXPOSE 8081

CMD ["./rate_limiter"]
