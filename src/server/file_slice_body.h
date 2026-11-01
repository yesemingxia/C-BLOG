#pragma once

#include <boost/beast/core/file.hpp>
#include <boost/beast/http.hpp>
#include <boost/optional.hpp>

#include <array>
#include <cstdint>
#include <string>

// @cuiruoni+B10：只发送文件的一段 [offset, offset+length)，
// @cuiruoni+用于 HTTP Range。Beast 自带 file_body 只能发送到文件末尾，
// @cuiruoni+无法把 Range 的 end 截断在文件中间，所以这里自定义一个 Body。
// @cuiruoni+读取按 64KB 分块，整个过程不会把视频读进内存。
struct FileSliceBody {
    struct value_type {
        boost::beast::file file;
        std::uint64_t length = 0;

        void open(const std::string& path, std::uint64_t offset,
                  std::uint64_t bytes, boost::beast::error_code& ec) {
            file.open(path.c_str(), boost::beast::file_mode::scan, ec);
            if (ec) return;
            if (offset > 0) file.seek(offset, ec);
            if (ec) return;
            length = bytes;
        }
    };

    class writer {
    public:
        using const_buffers_type = boost::asio::const_buffer;

        template <bool isRequest, class Fields>
        writer(boost::beast::http::header<isRequest, Fields>&, value_type& body)
            : body_(body), remaining_(body.length) {}

        void init(boost::beast::error_code& ec) { ec = {}; }

        boost::optional<std::pair<const_buffers_type, bool>> get(
            boost::beast::error_code& ec) {
            std::size_t amount = remaining_ > buffer_.size()
                ? buffer_.size()
                : static_cast<std::size_t>(remaining_);
            if (amount == 0) {
                ec = {};
                return boost::none;
            }
            std::size_t n = body_.file.read(buffer_.data(), amount, ec);
            if (ec) return boost::none;
            if (n == 0) {
                ec = boost::beast::http::error::short_read;
                return boost::none;
            }
            remaining_ -= n;
            return std::make_pair(const_buffers_type(buffer_.data(), n), remaining_ > 0);
        }

    private:
        value_type& body_;
        std::uint64_t remaining_;
        std::array<char, 64 * 1024> buffer_{};
    };

    // @cuiruoni+只用于序列化；解析路径不会用到，保留最小实现满足 Body 概念。
    class reader {
    public:
        template <bool isRequest, class Fields>
        reader(boost::beast::http::header<isRequest, Fields>&, value_type& body)
            : body_(body) {}

        void init(boost::optional<std::uint64_t> const&,
                  boost::beast::error_code& ec) { ec = {}; }

        std::size_t put(boost::asio::const_buffer buffer,
                        boost::beast::error_code& ec) {
            return body_.file.write(buffer.data(), buffer.size(), ec);
        }

        void finish(boost::beast::error_code& ec) { ec = {}; }

    private:
        value_type& body_;
    };

    static std::uint64_t size(value_type const& body) { return body.length; }
};
