#include "utils/logger.h"

#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/sinks/basic_file_sink.h>
#include <spdlog/sinks/dist_sink.h>
#include <vector>

static std::shared_ptr<spdlog::logger> g_logger;

void Logger::init(const std::string& level, const std::string& log_file) {
    std::vector<spdlog::sink_ptr> sinks;
    // @cuiruoni+控制台sink：彩色输出，带时间戳、级别和内容
    auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
    console_sink->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%^%l%$] %v");
    sinks.push_back(console_sink);

    // @cuiruoni+可选文件sink：配置了log_file时启用，追加写入
    if (!log_file.empty()) {
        auto file_sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(log_file, true);
        file_sink->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%l] %v");
        sinks.push_back(file_sink);
    }

    // @cuiruoni+多sink组合logger，info级别及以上自动flush
    g_logger = std::make_shared<spdlog::logger>("blog", sinks.begin(), sinks.end());
    g_logger->flush_on(spdlog::level::info);
    spdlog::set_default_logger(g_logger);
    set_level(level);
}

std::shared_ptr<spdlog::logger> Logger::get() {
    if (!g_logger) {
        init();
    }
    return g_logger;
}

void Logger::set_level(const std::string& level) {
    if (level == "trace") spdlog::set_level(spdlog::level::trace);
    else if (level == "debug") spdlog::set_level(spdlog::level::debug);
    else if (level == "info") spdlog::set_level(spdlog::level::info);
    else if (level == "warn") spdlog::set_level(spdlog::level::warn);
    else if (level == "error") spdlog::set_level(spdlog::level::err);
    else if (level == "critical") spdlog::set_level(spdlog::level::critical);
    else spdlog::set_level(spdlog::level::info);
}
