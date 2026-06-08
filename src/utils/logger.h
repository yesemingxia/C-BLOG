#pragma once

#include <spdlog/spdlog.h>
#include <memory>
#include <string>

// @cuiruoni+日志系统，基于spdlog，支持控制台彩色输出和可选文件输出
class Logger {
public:
    // @cuiruoni+初始化日志系统，level为日志级别，log_file为空则仅控制台输出
    static void init(const std::string& level = "info",
                     const std::string& log_file = "");

    static std::shared_ptr<spdlog::logger> get();

    static void set_level(const std::string& level);
};
