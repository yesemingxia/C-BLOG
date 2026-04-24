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
#include "controllers/tag_controller.h"
#include "controllers/search_controller.h"
#include "middleware/auth_middleware.h"

#include <boost/beast/http.hpp>
#include <boost/program_options.hpp>
#include <spdlog/spdlog.h>
#include <csignal>
#include <iostream>

namespace http = boost::beast::http;

namespace po = boost::program_options;

static Server* g_server = nullptr;

void signal_handler(int signum) {
    spdlog::info("Received signal {}, shutting down...", signum);
    if (g_server) {
        g_server->stop();
    }
}

int main(int argc, char* argv[]) {
    try {
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

        auto& cfg = Config::instance();
        cfg.load(config_path);

        Logger::init(cfg.log_level(), cfg.log_file());

        spdlog::info("cpp-blog starting...");
        spdlog::info("Config loaded from: {}", config_path);

        MysqlPool::instance().init(
            cfg.db_host(), cfg.db_port(), cfg.db_user(),
            cfg.db_password(), cfg.db_name(), cfg.db_pool_size());

        RedisPool::instance().init(
            cfg.redis_host(), cfg.redis_port(),
            cfg.redis_password(), cfg.redis_pool_size());

        Database::init_tables();

        Router router;

        register_auth_routes(router);
        register_post_routes(router);
        register_comment_routes(router);
        register_tag_routes(router);
        register_search_routes(router);

        router.add_route("OPTIONS", "/*", [](const auto& req, const auto&) {
            http::response<http::string_body> res{http::status::ok, req.version()};
            res.prepare_payload();
            return res;
        });

        std::signal(SIGINT, signal_handler);
        std::signal(SIGTERM, signal_handler);

        Server server(cfg.server_host(), cfg.server_port(), router);
        g_server = &server;

        spdlog::info("Server running on http://{}:{}", cfg.server_host(), cfg.server_port());
        server.run();

        MysqlPool::instance().close();
        RedisPool::instance().close();

        spdlog::info("cpp-blog stopped");
    } catch (const std::exception& e) {
        spdlog::critical("Fatal error: {}", e.what());
        return 1;
    }

    return 0;
}
