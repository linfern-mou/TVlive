<?php
/**
 * SOCKS5代理测试API（增强版）
 * 支持：SOCKS5代理（可选） + 直播源测试 + 自定义 User-Agent + 批量测试 + 强制IPv4 + 跳转链追踪
 */

// 设置响应头
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// 处理预检请求
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 只接受POST请求
if ($_SERVER['REQUEST_METHOD'] != 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => '只支持POST请求']);
    exit;
}

// 获取请求体
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    echo json_encode(['success' => false, 'error' => '无效的JSON数据']);
    exit;
}

$testType = $data['test_type'] ?? '';
$response = [];

// 自定义 User-Agent（可能为空）
$customUA = $data['user_agent'] ?? '';

try {
    switch ($testType) {
        case 'test_proxy':
            $response = testSocks5Proxy($data);
            break;

        case 'batch_test_m3u8_via_proxy':
            $response = batchTestM3U8ViaProxy($data, $customUA);
            break;

        default:
            $response = ['success' => false, 'error' => '未知的测试类型'];
            break;
    }
} catch (Exception $e) {
    $response = ['success' => false, 'error' => $e->getMessage()];
}

echo json_encode($response);


/**
 * SOCKS5代理连通性测试
 */
function testSocks5Proxy($data) {
    $proxyHost = $data['proxy_host'] ?? '';
    $proxyPort = $data['proxy_port'] ?? 1080;
    $proxyUsername = $data['proxy_username'] ?? '';
    $proxyPassword = $data['proxy_password'] ?? '';

    if (!$proxyHost || !$proxyPort) {
        return ['success' => false, 'error' => '代理主机和端口不能为空'];
    }

    $startTime = microtime(true);

    $socket = @fsockopen($proxyHost, $proxyPort, $errno, $errstr, 10);

    if (!$socket) {
        return [
            'success' => false,
            'error' => "无法连接到代理服务器: $errstr ($errno)",
            'response_time' => round((microtime(true) - $startTime) * 1000, 2)
        ];
    }

    stream_set_timeout($socket, 5);

    fwrite($socket, "\x05\x01\x00");
    $response = fread($socket, 2);

    if ($response !== "\x05\x00") {
        fclose($socket);
        return ['success' => false, 'error' => 'SOCKS5握手失败'];
    }

    // 如果需要鉴权
    if (!empty($proxyUsername)) {
        fwrite($socket, "\x05" . chr(strlen($proxyUsername)) . $proxyUsername . chr(strlen($proxyPassword)) . $proxyPassword);
        $authResponse = fread($socket, 2);
        if ($authResponse !== "\x05\x00") {
            fclose($socket);
            return ['success' => false, 'error' => 'SOCKS5身份验证失败'];
        }
    }

    fclose($socket);

    return [
        'success' => true,
        'protocol' => 'SOCKS5',
        'response_time' => round((microtime(true) - $startTime) * 1000, 2)
    ];
}


/**
 * 批量测试M3U8（支持代理和直连模式）
 */
function batchTestM3U8ViaProxy($data, $customUA = '') {
    $urlsText = $data['urls'] ?? '';
    $proxyHost = $data['proxy_host'] ?? '';
    $proxyPort = $data['proxy_port'] ?? 1080;
    $proxyUsername = $data['proxy_username'] ?? '';
    $proxyPassword = $data['proxy_password'] ?? '';
    $forceIPv4 = $data['force_ipv4'] ?? false; // 新增：强制使用IPv4

    if (!$urlsText) return ['success' => false, 'error' => 'URL列表不能为空'];
    
    // 解析URL列表（一行一个）
    $urls = explode("\n", trim($urlsText));
    $urls = array_map('trim', $urls);
    $urls = array_filter($urls); // 移除空行
    
    if (empty($urls)) {
        return ['success' => false, 'error' => '没有有效的URL'];
    }

    $results = [];
    $successCount = 0;
    $failedCount = 0;
    $validM3U8Count = 0;

    foreach ($urls as $index => $url) {
        $urlNumber = $index + 1;
        $totalUrls = count($urls);
        
        // 检查URL是否为空
        if (empty($url)) {
            $results[] = [
                'url' => $url,
                'success' => false,
                'error' => 'URL为空',
                'status_code' => 0,
                'is_m3u8' => false,
                'm3u8_valid' => false,
                'redirect_chain' => []
            ];
            $failedCount++;
            continue;
        }

        $startTime = microtime(true);

        // 第一步：检查HTTP状态码（支持跳转链追踪）
        $ch = curl_init();

        // 只有在有代理时才设置代理
        if ($proxyHost && $proxyPort) {
            curl_setopt($ch, CURLOPT_PROXY, "$proxyHost:$proxyPort");
            curl_setopt($ch, CURLOPT_PROXYTYPE, CURLPROXY_SOCKS5);

            if (!empty($proxyUsername)) {
                curl_setopt($ch, CURLOPT_PROXYUSERPWD, "$proxyUsername:$proxyPassword");
            }
        }

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 10); // 增加最大重定向次数
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);

        // 强制使用IPv4（解决IPv6重定向问题）
        if ($forceIPv4) {
            curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
        }

        // 默认 UA
        $defaultUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Safari/537.36';
        curl_setopt($ch, CURLOPT_USERAGENT, $customUA ?: $defaultUA);

        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_HEADER, true);
        curl_setopt($ch, CURLOPT_NOBODY, false);
        
        // 开启跳转链追踪
        $redirectChain = [];
        curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $headerLine) use (&$redirectChain) {
            // 解析重定向信息
            if (strpos($headerLine, 'HTTP/') === 0) {
                // 这是新的响应头开始，包含状态码
                preg_match('/HTTP\/\d\.\d\s+(\d+)/', $headerLine, $matches);
                if (isset($matches[1])) {
                    $lastStatus = intval($matches[1]);
                }
            } elseif (strpos(strtolower($headerLine), 'location:') === 0) {
                // 这是重定向地址
                $location = trim(substr($headerLine, 9));
                if (!empty($location) && isset($lastStatus) && ($lastStatus == 301 || $lastStatus == 302 || $lastStatus == 303 || $lastStatus == 307 || $lastStatus == 308)) {
                    $redirectChain[] = [
                        'status' => $lastStatus,
                        'url' => $location
                    ];
                }
            }
            return strlen($headerLine);
        });

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $error = curl_error($ch);
        $responseTime = round(microtime(true) - $startTime, 3) * 1000;
        
        // 获取最终URL（如果有跳转）
        $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        
        // 如果最终URL与原始URL不同且不在跳转链中，添加到跳转链
        if ($effectiveUrl !== $url && $effectiveUrl && $httpCode === 200) {
            // 检查跳转链中是否已包含最终URL
            $hasEffectiveUrl = false;
            foreach ($redirectChain as $redirect) {
                if ($redirect['url'] === $effectiveUrl) {
                    $hasEffectiveUrl = true;
                    break;
                }
            }
            
            if (!$hasEffectiveUrl && $effectiveUrl !== $url) {
                // 添加最终URL到跳转链
                $redirectChain[] = [
                    'status' => $httpCode,
                    'url' => $effectiveUrl
                ];
            }
        }

        // 检查是否是状态码200
        if ($httpCode !== 200) {
            curl_close($ch);
            $results[] = [
                'url' => $url,
                'success' => false,
                'status_code' => $httpCode,
                'response_time' => $responseTime,
                'error' => $error ?: "HTTP错误码: $httpCode",
                'is_m3u8' => false,
                'm3u8_valid' => false,
                'redirect_chain' => $redirectChain
            ];
            $failedCount++;
            continue;
        }

        // 第二步：检查是否为M3U8文件
        $isM3U8 = false;
        $m3u8Valid = false;
        $m3u8Info = null;

        // 检查Content-Type或URL扩展名
        $urlLower = strtolower($effectiveUrl);
        if (strpos($contentType, 'application/vnd.apple.mpegurl') !== false ||
            strpos($contentType, 'application/x-mpegurl') !== false ||
            strpos($urlLower, '.m3u8') !== false) {
            $isM3U8 = true;

            // 获取完整的响应内容（移除头部）
            $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
            $body = substr($response, $headerSize);
            
            // 检查M3U8内容是否有效
            $m3u8Valid = validateM3U8Content($body);
            $m3u8Info = analyzeM3U8Content($body);
        }

        curl_close($ch);

        $success = ($httpCode === 200);
        if ($success) {
            $successCount++;
            if ($isM3U8 && $m3u8Valid) {
                $validM3U8Count++;
            }
        } else {
            $failedCount++;
        }

        $results[] = [
            'url' => $url,
            'success' => $success,
            'status_code' => $httpCode,
            'response_time' => $responseTime,
            'content_type' => $contentType,
            'is_m3u8' => $isM3U8,
            'm3u8_valid' => $m3u8Valid,
            'm3u8_info' => $m3u8Info,
            'redirect_chain' => $redirectChain,
            'effective_url' => $effectiveUrl,
            'error' => $success ? null : ($error ?: "HTTP错误码: $httpCode")
        ];
    }

    return [
        'success' => true,
        'total_urls' => count($urls),
        'success_count' => $successCount,
        'failed_count' => $failedCount,
        'valid_m3u8_count' => $validM3U8Count,
        'results' => $results,
        'summary' => [
            '成功率' => round(($successCount / count($urls)) * 100, 2) . '%',
            '有效M3U8率' => count($urls) > 0 ? round(($validM3U8Count / count($urls)) * 100, 2) . '%' : '0%'
        ]
    ];
}

/**
 * 验证M3U8内容是否有效
 */
function validateM3U8Content($content) {
    if (empty($content)) {
        return false;
    }

    // 检查是否是有效的M3U8文件
    $lines = explode("\n", trim($content));
    
    // 检查第一行是否是 #EXTM3U
    if (empty($lines) || strpos(trim($lines[0]), '#EXTM3U') !== 0) {
        return false;
    }

    // 检查是否包含至少一个有效的EXTINF行
    $hasExtInf = false;
    foreach ($lines as $line) {
        $trimmedLine = trim($line);
        if (strpos($trimmedLine, '#EXTINF:') === 0) {
            $hasExtInf = true;
            break;
        }
    }

    return $hasExtInf;
}

/**
 * 分析M3U8内容
 */
function analyzeM3U8Content($content) {
    $lines = explode("\n", trim($content));
    $info = [
        'total_lines' => count($lines),
        'extinf_count' => 0,
        'ts_segments' => 0,
        'duration' => 0,
        'has_endlist' => false,
        'has_playlist' => false,
        'max_bitrate' => 0,
        'avg_duration' => 0
    ];

    $durations = [];
    $currentDuration = 0;

    foreach ($lines as $line) {
        $trimmedLine = trim($line);
        
        if (strpos($trimmedLine, '#EXTINF:') === 0) {
            $info['extinf_count']++;
            
            // 提取持续时间
            preg_match('/#EXTINF:([\d\.]+)/', $trimmedLine, $matches);
            if (isset($matches[1])) {
                $duration = floatval($matches[1]);
                $durations[] = $duration;
                $info['duration'] += $duration;
            }
        } 
        elseif (strpos($trimmedLine, '.ts') !== false || 
                strpos($trimmedLine, '.m4s') !== false ||
                strpos($trimmedLine, '.mp4') !== false) {
            $info['ts_segments']++;
        }
        elseif (strpos($trimmedLine, '#EXT-X-ENDLIST') === 0) {
            $info['has_endlist'] = true;
        }
        elseif (strpos($trimmedLine, '#EXT-X-STREAM-INF') === 0) {
            $info['has_playlist'] = true;
            
            // 提取比特率
            preg_match('/BANDWIDTH=(\d+)/', $trimmedLine, $matches);
            if (isset($matches[1])) {
                $bitrate = intval($matches[1]);
                if ($bitrate > $info['max_bitrate']) {
                    $info['max_bitrate'] = $bitrate;
                }
            }
        }
    }

    // 计算平均持续时间
    if ($info['extinf_count'] > 0) {
        $info['avg_duration'] = round($info['duration'] / $info['extinf_count'], 2);
    }

    // 格式化比特率
    if ($info['max_bitrate'] > 0) {
        if ($info['max_bitrate'] >= 1000000) {
            $info['max_bitrate_formatted'] = round($info['max_bitrate'] / 1000000, 2) . ' Mbps';
        } else {
            $info['max_bitrate_formatted'] = round($info['max_bitrate'] / 1000, 2) . ' Kbps';
        }
    } else {
        $info['max_bitrate_formatted'] = '未知';
    }

    return $info;
}

?>