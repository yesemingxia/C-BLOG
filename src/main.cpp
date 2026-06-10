#include "utils/logger.h"
#include "utils/config.h"
#include "db/mysql_pool.h"
#include "db/redis_pool.h"
#include "db/database.h"
#include "server/server.h"
#include "server/router.h"
#include "controllers/auth_controller.h"
#include "controllers/post_controller.h"
#include "controllers/comment_controller.h"
#include "controllers/admin_controller.h"
#include "controllers/tag_controller.h"
#include "controllers/contact_controller.h"
#include "controllers/search_controller.h"
#include "controllers/notification_controller.h"
#include "middleware/auth_middleware.h"

#include <boost/beast/http.hpp>
#include <boost/program_options.hpp>
#include <boost/json.hpp>
#include <spdlog/spdlog.h>
#include <csignal>
#include <iostream>
#include <atomic>
#include <thread>

namespace http = boost::beast::http;

namespace po = boost::program_options;

static std::atomic<bool> g_shutdown{false};

void signal_handler(int signum) {
    spdlog::info("Received signal {}, shutting down...", signum);
    g_shutdown = true;
}

int main(int argc, char* argv[]) {
    // @cuiruoni+程序入口：配置加载→日志初始化→连接池初始化→建表→路由注册→信号处理→启动服务器
    try {
        // @cuiruoni+使用boost::program_options解析命令行参数，支持--config指定配置文件路径
        po::options_description desc("cpp-blog options");
        desc.add_options()
            ("help,h", "Show help")
            ("config,c", po::value<std::string>()->default_value("config/config.json"), "Config file path");

        po::variables_map vm;
        po::store(po::parse_command_line(argc, argv, desc), vm);
        po::notify(vm);

        if (vm.count("help")) {
            std::cout << desc << std::endl;
            return 0;
        }

        std::string config_path = vm["config"].as<std::string>();

        // @cuiruoni+单例模式加载配置，全局唯一，后续通过Config::instance()访问
        auto& cfg = Config::instance();
        cfg.load(config_path);

        Logger::init(cfg.log_level(), cfg.log_file());

        spdlog::info("cpp-blog starting...");
        spdlog::info("Config loaded from: {}", config_path);

        // @cuiruoni+初始化MySQL连接池，使用X DevAPI协议（端口33060）
        MysqlPool::instance().init(
            cfg.db_host(), cfg.db_port(), cfg.db_user(),
            cfg.db_password(), cfg.db_name(), cfg.db_pool_size());

        // @cuiruoni+初始化Redis连接池，用于JWT黑名单和搜索缓存
        RedisPool::instance().init(
            cfg.redis_host(), cfg.redis_port(),
            cfg.redis_password(), cfg.redis_pool_size());

        // @cuiruoni+自动建表，使用CREATE IF NOT EXISTS保证幂等
        Database::init_tables();

        Router router;

        // @cuiruoni+注册各业务模块路由，每个模块独立管理自己的路由表
        register_auth_routes(router);
        register_post_routes(router);
        register_comment_routes(router);
        register_admin_routes(router);
        register_tag_routes(router);
        register_search_routes(router);
        register_notification_routes(router);
        register_contact_routes(router);

        // @cuiruoni+健康检查端点，包含MySQL/Redis连接池状态
        router.add_route("GET", "/", [](const auto& req, const auto&) {
            bool mysql_ok = MysqlPool::instance().health_check();
            bool redis_ok = RedisPool::instance().health_check();
            json::object data;
            data["mysql"] = mysql_ok;
            data["redis"] = redis_ok;
            http::response<http::string_body> res{http::status::ok, req.version()};
            res.set(http::field::content_type, "application/json");
            res.body() = json::serialize(json::value{
                {"code", 0},
                {"message", "cpp-blog is running"},
                {"data", data}
            });
            res.prepare_payload();
            return res;
        });

        // @cuiruoni+注册信号处理，支持Ctrl+C和kill命令优雅退出
        std::signal(SIGINT, signal_handler);
        std::signal(SIGTERM, signal_handler);

        Server server(cfg.server_host(), cfg.server_port(), router, cfg.server_threads());

        spdlog::info("Server running on http://{}:{}", cfg.server_host(), cfg.server_port());

        // @cuiruoni+在独立线程中运行服务器
        std::thread server_thread([&server]() {
            server.run();
        });

        // @cuiruoni+主线程轮询关闭信号
        while (!g_shutdown) {
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
        }
        server.stop();
        server_thread.join();

        // @cuiruoni+服务器停止后释放所有连接池资源
        MysqlPool::instance().close();
        RedisPool::instance().close();

        spdlog::info("cpp-blog stopped");
    } catch (const std::exception& e) {
        spdlog::critical("Fatal error: {}", e.what());
        return 1;
    }

    return 0;
}
