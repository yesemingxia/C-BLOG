#pragma once

#include <spdlog/spdlog.h>
#include <memory>
#include <string>

class Logger {
public:
    static void init(const std::string& level = "info",
                     const std::string& log_file = "");

    static std::shared_ptr<spdlog::logger> get();

    static void set_level(const std::string& level);
};
