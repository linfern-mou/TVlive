document.addEventListener('DOMContentLoaded', function() {
    // ==================== 全局变量 ====================
    let isBatchTesting = false;
    let batchTestStopped = false;
    let batchTestResults = [];
    let channelEntries = []; // {name, url, group}
    let testRecords = [];
    let currentTestLogs = [];
    const MAX_RECORDS = 20;

    // ==================== DOM元素 ====================
    const batchUrlsTextarea = document.getElementById('batch-urls');
    const batchTestBtn = document.getElementById('batch-test-btn');
    const stopBatchTestBtn = document.getElementById('stop-batch-test');
    const loadExampleUrlsBtn = document.getElementById('load-example-urls');
    const importTxtFileInput = document.getElementById('import-txt-file');
    const clearUrlsBtn = document.getElementById('clear-urls');
    const exportResultsBtn = document.getElementById('export-results-btn');
    const exportValidReportBtn = document.getElementById('export-valid-report-btn');
    const clearResultsBtn = document.getElementById('clear-results-btn');
    const clearLogBtn = document.getElementById('clear-log-btn');
    const exportLogBtn = document.getElementById('export-log-btn');
    const batchResultBody = document.getElementById('batch-result-body');
    const logBox = document.getElementById('log-box');
    const testLogCard = document.getElementById('test-log-card');
    const clearRecordsBtn = document.getElementById('clear-records-btn');
    const recordsList = document.getElementById('records-list');
    const recordsCount = document.getElementById('records-count');

    const totalUrlsStat = document.getElementById('total-urls-stat');
    const completedUrlsStat = document.getElementById('completed-urls-stat');
    const successUrlsStat = document.getElementById('success-urls-stat');
    const failedUrlsStat = document.getElementById('failed-urls-stat');
    const validM3U8Stat = document.getElementById('valid-m3u8-stat');
    const successRateStat = document.getElementById('success-rate-stat');
    const urlCount = document.getElementById('url-count');
    const progressFill = document.getElementById('progress-fill');

    const useAuthCheckbox = document.getElementById('use-auth');
    const authFields = document.getElementById('auth-fields');
    const customUAInput = document.getElementById('custom-ua');
    const uaPresetSelect = document.getElementById('ua-preset');

    // ==================== 辅助函数 ====================
    function getShortUrl(url, maxLength = 180) {
        if (!url || url.length <= maxLength) return url;
        // 只在结尾处省略，保留前面完整的URL
        return url.substring(0, maxLength - 3) + '...';
    }

    function extractNameFromURL(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            const pathname = urlObj.pathname;
            
            const pathParts = pathname.split('/').filter(p => p);
            if (pathParts.length > 0) {
                const lastPart = pathParts[pathParts.length - 1];
                const nameWithoutExt = lastPart.replace(/\.[^/.]+$/, '');
                if (nameWithoutExt) {
                    return nameWithoutExt;
                }
            }
            
            return hostname;
        } catch (e) {
            return url.substring(0, 30) + (url.length > 30 ? '...' : '');
        }
    }

    // ==================== 初始化 ====================
    function init() {
        authFields.style.display = 'none';
        
        if (exportResultsBtn) exportResultsBtn.style.display = 'none';
        
        initTestRecords();
        bindEvents();
        
        if (batchUrlsTextarea && batchUrlsTextarea.value) {
            loadChannelsFromText(batchUrlsTextarea.value);
        }
        
        addLog('SOCKS5直播源测试工具已加载完成', 'success');
        addLog('支持功能：频道名+URL格式、纯URL格式、分组、TXT导入、测试报告导出、测试记录', 'info');
        addLog('提示：代理配置为可选，不填写时使用直连测试', 'info');
    }

    function initTestRecords() {
        try {
            const saved = localStorage.getItem('testRecords');
            if (saved) {
                testRecords = JSON.parse(saved).slice(0, MAX_RECORDS);
            }
        } catch (e) {
            console.error('读取测试记录失败:', e);
            testRecords = [];
        }
        updateRecordsDisplay();
    }

    // ==================== 事件绑定 ====================
    function bindEvents() {
        if (useAuthCheckbox) {
            useAuthCheckbox.addEventListener('change', function() {
                authFields.style.display = this.checked ? 'block' : 'none';
            });
        }

        if (uaPresetSelect) {
            uaPresetSelect.addEventListener('change', function() {
                if (this.value && customUAInput) {
                    customUAInput.value = this.value;
                    addLog(`已选择预置User-Agent: ${this.options[this.selectedIndex].text}`, 'info');
                }
            });
        }

        if (stopBatchTestBtn) {
            stopBatchTestBtn.addEventListener('click', function() {
                batchTestStopped = true;
                addLog('正在停止测试...', 'warning');
            });
        }

        if (importTxtFileInput) {
            importTxtFileInput.addEventListener('change', handleFileImport);
        }

        if (loadExampleUrlsBtn) {
            loadExampleUrlsBtn.addEventListener('click', loadExample);
        }

        if (clearUrlsBtn) {
            clearUrlsBtn.addEventListener('click', function() {
                batchUrlsTextarea.value = '';
                channelEntries = [];
                updateUrlCount();
                addLog('已清空频道列表', 'info');
            });
        }

        if (batchTestBtn) {
            batchTestBtn.addEventListener('click', startBatchTest);
        }

        if (exportValidReportBtn) {
            exportValidReportBtn.addEventListener('click', exportValidReport);
        }

        if (clearResultsBtn) {
            clearResultsBtn.addEventListener('click', function() {
                batchTestResults = [];
                if (batchResultBody) {
                    batchResultBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8;">测试结果已清除</td></tr>';
                }
                updateStats();
                if (progressFill) progressFill.style.width = '0%';
                addLog('测试结果已清除', 'info');
            });
        }

        if (clearRecordsBtn) {
            clearRecordsBtn.addEventListener('click', function() {
                if (testRecords.length === 0) {
                    addLog('没有测试记录可清除', 'info');
                    return;
                }
                
                if (confirm(`确定要清除所有${testRecords.length}条测试记录吗？`)) {
                    testRecords = [];
                    saveTestRecords();
                    updateRecordsDisplay();
                    addLog('所有测试记录已清除', 'info');
                }
            });
        }

        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', function() {
                if (!logBox || logBox.children.length === 0) {
                    addLog('日志已为空', 'info');
                    return;
                }
                
                if (confirm('确定要清除所有日志吗？')) {
                    logBox.innerHTML = '';
                    currentTestLogs = [];
                    addLog('日志已清除', 'info');
                }
            });
        }

        if (exportLogBtn) {
            exportLogBtn.addEventListener('click', exportLog);
        }

        if (batchUrlsTextarea) {
            batchUrlsTextarea.addEventListener('input', function() {
                loadChannelsFromText(this.value);
            });
        }
    }

    // ==================== 核心功能 ====================
    function parseChannelList(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const entries = [];
        let currentGroup = '未分组';

        for (let line of lines) {
            if (line.endsWith(',#genre#')) {
                currentGroup = line.slice(0, -8).trim() || '未分组';
                continue;
            }
            
            if (line.includes(',http')) {
                const lastComma = line.lastIndexOf(',http');
                const name = line.substring(0, lastComma).trim();
                const url = line.substring(lastComma + 1).trim();
                if (url) {
                    entries.push({ 
                        name: name || extractNameFromURL(url), 
                        url, 
                        group: currentGroup 
                    });
                }
            } 
            else if (line.startsWith('http://') || line.startsWith('https://')) {
                const url = line.trim();
                entries.push({ 
                    name: extractNameFromURL(url), 
                    url, 
                    group: currentGroup 
                });
            }
        }
        
        return entries;
    }

    function loadChannelsFromText(text) {
        channelEntries = parseChannelList(text);
        if (batchUrlsTextarea) {
            batchUrlsTextarea.value = text;
        }
        updateUrlCount();
    }

    function updateUrlCount() {
        const count = channelEntries.length;
        if (urlCount) urlCount.textContent = `频道数量: ${count}`;
        if (totalUrlsStat) totalUrlsStat.textContent = count;
    }

    function addLog(message, type = 'info', details = null) {
        const now = new Date();
        const timeString = `[${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}]`;

        const logEntry = { time: timeString, type, message, details, timestamp: now.getTime() };
        currentTestLogs.push(logEntry);

        if (!logBox) return;

        const div = document.createElement('div');
        div.className = 'log-entry';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = timeString;

        const msgSpan = document.createElement('span');
        msgSpan.className = `log-${type}`;
        
        // 直接显示原始消息，不做特殊处理
        // 让测试函数构建完整的消息
        msgSpan.textContent = message;
        msgSpan.title = message; // 悬停显示原始完整消息

        div.appendChild(timeSpan);
        div.appendChild(msgSpan);
        logBox.appendChild(div);
        logBox.scrollTop = logBox.scrollHeight;
        
        // 确保日志区域可见
        if (type === 'info' || type === 'success' || type === 'error') {
            setTimeout(() => {
                if (logBox) logBox.scrollTop = logBox.scrollHeight;
            }, 50);
        }
    }

    async function startBatchTest() {
        if (isBatchTesting) return;
        if (channelEntries.length === 0) {
            addLog('请先输入或导入频道列表', 'warning');
            return;
        }

        isBatchTesting = true;
        batchTestStopped = false;
        batchTestResults = [];
        
        if (batchResultBody) {
            batchResultBody.innerHTML = '<tr><td colspan="7">测试中...</td></tr>';
        }
        
        if (progressFill) progressFill.style.width = '0%';
        
        // 显示测试日志卡片并自动滚动到该位置
        if (testLogCard) {
            testLogCard.style.display = 'block';
            // 延迟执行滚动，确保DOM已更新
            setTimeout(() => {
                testLogCard.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start'
                });
            }, 100);
        }
        
        if (batchTestBtn) batchTestBtn.style.display = 'none';
        if (stopBatchTestBtn) stopBatchTestBtn.style.display = 'block';

        const proxyInput = document.getElementById('proxy')?.value.trim() || '';
        const [proxyHost, proxyPortStr] = proxyInput ? proxyInput.split(':') : ['', ''];
        const proxyPort = proxyPortStr ? parseInt(proxyPortStr) : 1080;
        const useAuth = useAuthCheckbox?.checked || false;
        const proxyUsername = document.getElementById('proxy-username')?.value.trim() || '';
        const proxyPassword = document.getElementById('proxy-password')?.value.trim() || '';
        const customUA = customUAInput?.value.trim() || '';
        const forceIPv4 = document.getElementById('force-ipv4')?.checked || false;
        const testProxyFirst = document.getElementById('test-proxy-first')?.checked || false;
        const stopOnFirstFailure = document.getElementById('stop-on-first-failure')?.checked || false;
        const testOnlyM3U8 = document.getElementById('test-only-m3u8')?.checked || false;

        const urls = channelEntries.map(e => e.url);

        if (proxyHost) {
            addLog(`开始批量测试（使用代理: ${proxyHost}:${proxyPort}），共 ${urls.length} 个频道`, 'info');
        } else {
            addLog(`开始批量测试（直连模式），共 ${urls.length} 个频道`, 'info');
        }

        // 如果有代理且需要测试代理连通性
        if (proxyHost && testProxyFirst) {
            addLog('正在测试SOCKS5代理连通性...', 'info');
            try {
                const proxyTestRes = await fetch('api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        test_type: 'test_proxy',
                        proxy_host: proxyHost,
                        proxy_port: proxyPort,
                        proxy_username: useAuth ? proxyUsername : '',
                        proxy_password: useAuth ? proxyPassword : ''
                    })
                }).then(r => r.json());

                if (!proxyTestRes.success) {
                    addLog(`代理连接失败: ${proxyTestRes.error}`, 'error');
                    resetTestState();
                    return;
                }
                addLog(`代理连通性测试通过 (${proxyTestRes.response_time}ms)`, 'success');
            } catch (e) {
                addLog(`代理测试异常: ${e.message}`, 'error');
                resetTestState();
                return;
            }
        }

        for (let i = 0; i < urls.length; i++) {
            if (batchTestStopped) {
                addLog('测试已手动停止', 'warning');
                break;
            }

            const url = urls[i];
            const entry = channelEntries[i];
            const index = i + 1;
            
            if (progressFill) {
                updateProgress((index / urls.length) * 100);
            }

            if (testOnlyM3U8 && !url.toLowerCase().includes('.m3u8')) {
                const res = {
                    url, 
                    entry,
                    success: false, 
                    status_code: 0, 
                    response_time: 0,
                    is_m3u8: false, 
                    m3u8_valid: false, 
                    skipped: true,
                    error: '跳过非M3U8文件'
                };
                batchTestResults.push(res);
                addResultToTable(res, index);
                updateStats();
                
                // 构建完整的日志消息：序号/总数 频道名 - 状态 (详情) → URL
                const displayUrl = getShortUrl(entry.url, 120);
                addLog(`[${index}/${urls.length}] ${entry.name} - 跳过 (非M3U8文件) → ${entry.url}`, 'warning');
                continue;
            }

            const payload = {
                test_type: 'batch_test_m3u8_via_proxy',
                urls: url,
                user_agent: customUA,
                force_ipv4: forceIPv4
            };
            
            // 只有在有代理时才添加代理参数
            if (proxyHost) {
                payload.proxy_host = proxyHost;
                payload.proxy_port = proxyPort;
                
                if (useAuth && proxyUsername) {
                    payload.proxy_username = proxyUsername;
                    payload.proxy_password = proxyPassword;
                }
            }

            try {
                const response = await fetch('api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                let result = {
                    url, 
                    entry,
                    success: false, 
                    status_code: 0, 
                    response_time: 0,
                    is_m3u8: false, 
                    m3u8_valid: false
                };

                if (data.success && data.results && data.results[0]) {
                    Object.assign(result, data.results[0]);
                    result.entry = entry;
                } else {
                    result.error = data.error || '未知错误';
                }

                batchTestResults.push(result);
                addResultToTable(result, index);
                updateStats();

                // 构建完整的日志消息
                const displayUrl = getShortUrl(entry.url, 120);
                
                if (result.success) {
                    // 成功：显示响应时间
                    addLog(`[${index}/${urls.length}] ${entry.name} - 成功 (${result.response_time?.toFixed(0) || 0}ms) → ${entry.url}`, 'success');
                } else {
                    // 失败：显示状态码和错误信息
                    let errorDetail = '';
                    if (result.status_code) {
                        errorDetail = `状态码: ${result.status_code}`;
                    }
                    if (result.error && result.error !== `HTTP错误码: ${result.status_code}`) {
                        errorDetail += errorDetail ? `, ${result.error}` : result.error;
                    }
                    if (!errorDetail) {
                        errorDetail = '未知错误';
                    }
                    
                    addLog(`[${index}/${urls.length}] ${entry.name} - 失败 (${errorDetail}) → ${entry.url}`, 'error');
                    
                    if (stopOnFirstFailure && result.error && /代理|Empty reply/i.test(result.error)) {
                        addLog('检测到代理连接失败，已停止测试', 'error');
                        batchTestStopped = true;
                    }
                }
            } catch (err) {
                const result = { 
                    url, 
                    entry,
                    success: false, 
                    error: err.message 
                };
                batchTestResults.push(result);
                addResultToTable(result, index);
                updateStats();
                
                // 网络错误：显示错误信息
                const displayUrl = getShortUrl(entry.url, 120);
                addLog(`[${index}/${urls.length}] ${entry.name} - 网络错误 (${err.message}) → ${entry.url}`, 'error');
            }
        }

        finishTest();
    }

    function resetTestState() {
        isBatchTesting = false;
        if (batchTestBtn) batchTestBtn.style.display = 'block';
        if (stopBatchTestBtn) stopBatchTestBtn.style.display = 'none';
    }

    function finishTest() {
        isBatchTesting = false;
        if (batchTestBtn) batchTestBtn.style.display = 'block';
        if (stopBatchTestBtn) stopBatchTestBtn.style.display = 'none';
        
        if (progressFill) updateProgress(100);
        
        const successCount = batchTestResults.filter(r => r.success).length;
        const validCount = batchTestResults.filter(r => r.m3u8_valid).length;
        addLog(`批量测试完成！成功: ${successCount} 个，有效M3U8: ${validCount} 个`, 'success');

        saveCurrentTestRecord();
    }

    function updateProgress(p) {
        if (progressFill) {
            progressFill.style.width = p + '%';
        }
    }

    function updateStats() {
        const total = batchTestResults.length;
        const success = batchTestResults.filter(r => r.success).length;
        const valid = batchTestResults.filter(r => r.m3u8_valid).length;
        
        if (completedUrlsStat) completedUrlsStat.textContent = total;
        if (successUrlsStat) successUrlsStat.textContent = success;
        if (failedUrlsStat) failedUrlsStat.textContent = total - success;
        if (validM3U8Stat) validM3U8Stat.textContent = valid;
        if (successRateStat) {
            successRateStat.textContent = total ? Math.round((success / total) * 100) + '%' : '0%';
        }
    }

    function addResultToTable(result, index) {
        if (!batchResultBody) return;
        
        if (batchResultBody.querySelector('td[colspan="7"]') && 
            batchResultBody.querySelector('td').textContent === '测试中...') {
            batchResultBody.innerHTML = '';
        }

        const entry = result.entry || { name: result.url, url: result.url };
        const displayName = entry.name;
        const displayURL = entry.url || result.url;

        // 显示名称和URL（URL只在结尾省略）
        const displayText = `${displayName} ${getShortUrl(displayURL, 100)}`;
        const fullText = `${displayName}\n${displayURL}`;

        const statusCodeClass = result.status_code === 200 ? 'status-200' :
                                result.status_code >= 400 ? 'status-404' :
                                result.status_code >= 500 ? 'status-500' : 'status-302';

        const m3u8Status = result.skipped ? '跳过' : (result.is_m3u8 ? '是' : '否');
        const m3u8Class = result.skipped ? 'status-warning-badge' : (result.is_m3u8 ? 'm3u8-badge' : 'status-neutral');

        const validStatus = result.skipped ? '-' : (result.m3u8_valid ? '有效' : (result.is_m3u8 ? '无效' : '-'));
        const validClass = result.skipped ? 'status-neutral' : (result.m3u8_valid ? 'valid-badge' : 'invalid-badge');

        let details = result.skipped ? '跳过非M3U8' :
                      result.success && result.m3u8_valid ? `分段: ${result.m3u8_info?.ts_segments || 0}` :
                      result.success ? `成功 ${result.response_time?.toFixed(0) || 0}ms` : (result.error || '失败');

        if (result.redirect_chain?.length > 0) details += ` (${result.redirect_chain.length}次跳转)`;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index}</td>
            <td class="url-cell" title="${fullText}">${displayText}</td>
            <td><span class="status-code ${statusCodeClass}">${result.status_code || '-'}</span></td>
            <td>${result.response_time?.toFixed(0) || 0}ms</td>
            <td><span class="status-badge ${m3u8Class}">${m3u8Status}</span></td>
            <td><span class="status-badge ${validClass}">${validStatus}</span></td>
            <td class="details-cell" title="${details}">${details}</td>
        `;
        batchResultBody.appendChild(row);
    }

    // ==================== 测试记录 ====================
    function updateRecordsDisplay() {
        if (!recordsList) return;
        
        recordsList.innerHTML = '';
        
        if (testRecords.length === 0) {
            recordsList.innerHTML = `
                <div class="record-empty">
                    <i class="fas fa-history"></i>
                    <p>暂无测试记录</p>
                    <p style="font-size: 0.8rem; margin-top: 5px;">完成测试后将自动保存记录</p>
                </div>
            `;
            if (recordsCount) recordsCount.textContent = `记录: 0/${MAX_RECORDS}`;
            return;
        }
        
        testRecords.forEach((record, index) => {
            const recordElement = document.createElement('div');
            recordElement.className = 'record-compact';
            
            const successRate = record.summary ? 
                Math.round((record.summary.success / record.summary.total) * 100) : 0;
            
            const successRateClass = successRate >= 80 ? 'high' : 
                                   successRate >= 50 ? 'medium' : 'low';
            
            // 只显示第一个URL，完整显示一行
            let urlDisplay = '';
            if (record.urls && record.urls.length > 0) {
                // 显示第一个URL，完整显示，只在结尾省略
                urlDisplay = getShortUrl(record.urls[0], 180); // 显示更长的URL
            }
            
            // 完整的URL列表用于悬停提示
            const fullUrls = record.urls ? record.urls.join('\n') : '';
            
            recordElement.innerHTML = `
                <div class="record-compact-header">
                    <span class="record-time">${record.timestamp || '未知时间'}</span>
                    <span class="record-proxy" title="${record.proxy || '无代理'}">
                        ${record.proxy ? getShortUrl(`socks5://${record.proxy}`, 40) : '直连'}
                    </span>
                </div>
                <div class="record-url" title="${fullUrls}">
                    ${urlDisplay}
                </div>
                <div class="record-stats">
                    <span class="record-url-count">${record.summary ? record.summary.total : 0}个URL</span>
                    <span class="record-success-rate ${successRateClass}">${successRate}% 成功率</span>
                </div>
                <button class="record-delete-btn" title="删除记录">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            
            recordElement.addEventListener('click', function(e) {
                if (!e.target.closest('.record-delete-btn')) {
                    restoreRecordConfig(index);
                }
            });
            
            const deleteBtn = recordElement.querySelector('.record-delete-btn');
            deleteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                deleteRecord(index);
            });
            
            recordsList.appendChild(recordElement);
        });
        
        if (recordsCount) recordsCount.textContent = `记录: ${testRecords.length}/${MAX_RECORDS}`;
    }

    function restoreRecordConfig(index) {
        const record = testRecords[index];
        if (!record) return;
        
        if (document.getElementById('proxy')) {
            document.getElementById('proxy').value = record.proxy || '';
        }
        if (document.getElementById('proxy-username')) {
            document.getElementById('proxy-username').value = record.proxyUsername || '';
        }
        if (document.getElementById('proxy-password')) {
            document.getElementById('proxy-password').value = record.proxyPassword || '';
        }
        if (useAuthCheckbox) {
            useAuthCheckbox.checked = !!record.proxyUsername;
        }
        if (authFields) {
            authFields.style.display = useAuthCheckbox.checked ? 'block' : 'none';
        }
        
        if (customUAInput && record.customUA) {
            customUAInput.value = record.customUA;
        }
        
        if (batchUrlsTextarea) {
            if (record.channelEntries && record.channelEntries.length > 0) {
                let text = '';
                let currentGroup = '';
                
                record.channelEntries.forEach(entry => {
                    if (entry.group !== currentGroup) {
                        if (currentGroup !== '') text += '\n';
                        text += `${entry.group},#genre#\n`;
                        currentGroup = entry.group;
                    }
                    text += `${entry.name || entry.url},${entry.url}\n`;
                });
                
                batchUrlsTextarea.value = text;
                loadChannelsFromText(text);
            } else if (record.urls && record.urls.length > 0) {
                batchUrlsTextarea.value = record.urls.join('\n');
                loadChannelsFromText(batchUrlsTextarea.value);
            }
        }
        
        addLog(`已加载测试记录: ${record.timestamp}`, 'success');
    }

    function deleteRecord(index) {
        if (confirm('确定要删除这条测试记录吗？')) {
            testRecords.splice(index, 1);
            saveTestRecords();
            updateRecordsDisplay();
            addLog('测试记录已删除', 'info');
        }
    }

    function saveTestRecords() {
        try {
            localStorage.setItem('testRecords', JSON.stringify(testRecords));
        } catch (e) {
            console.error('保存测试记录失败:', e);
        }
    }

    function saveCurrentTestRecord() {
        const now = new Date();
        const timestamp = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        
        const proxyInput = document.getElementById('proxy')?.value.trim() || '';
        const proxyUsername = document.getElementById('proxy-username')?.value.trim() || '';
        const customUA = customUAInput?.value.trim() || '';
        
        const record = {
            timestamp: timestamp,
            proxy: proxyInput,
            proxyUsername: proxyUsername,
            customUA: customUA,
            urls: channelEntries.map(e => e.url),
            channelEntries: JSON.parse(JSON.stringify(channelEntries)),
            results: batchTestResults.map(r => ({
                url: r.url,
                success: r.success,
                status_code: r.status_code,
                is_m3u8: r.is_m3u8,
                m3u8_valid: r.m3u8_valid,
                response_time: r.response_time
            })),
            summary: {
                total: batchTestResults.length,
                success: batchTestResults.filter(r => r.success).length,
                valid: batchTestResults.filter(r => r.m3u8_valid).length
            }
        };
        
        testRecords.unshift(record);
        
        if (testRecords.length > MAX_RECORDS) {
            testRecords = testRecords.slice(0, MAX_RECORDS);
        }
        
        saveTestRecords();
        updateRecordsDisplay();
        
        addLog(`测试记录已保存 (${timestamp})`, 'info');
    }

    // ==================== 文件导入和示例 ====================
    function handleFileImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            loadChannelsFromText(ev.target.result);
            addLog(`已导入文件: ${file.name}（${channelEntries.length} 个频道）`, 'success');
        };
        reader.readAsText(file, 'UTF-8');
    }

    function loadExample() {
        const example = `央视,#genre#
CCTV1,http://tvgslb.hn.chinamobile.com:8089/180000001002/00000001000000000007000000001243/main.m3u8
CCTV2,http://tvgslb.hn.chinamobile.com:8089/180000001002/00000001000000000008000000047431/main.m3u8

卫视,#genre#
湖南卫视,http://tvgslb.hn.chinamobile.com:8089/180000001002/00000001000000000010000000040382/main.m3u8
江苏卫视,http://tvgslb.hn.chinamobile.com:8089/180000001002/00000001000000000007000000001244/main.m3u8

# 也支持纯URL格式（没有频道名）
http://tvgslb.hn.chinamobile.com:8089/180000001002/00000001000000000002000000113182/main.m3u8
http://tvgslb.hn.chinamobile.com:8089/180000001002/00000001000000000007000000001249/main.m3u8`;
        loadChannelsFromText(example);
        addLog('已加载示例频道列表（支持带频道名和纯URL格式）', 'success');
    }

    // ==================== 导出功能 ====================
    function exportValidReport() {
        if (batchTestResults.length === 0) {
            alert('请先完成一次测试！');
            return;
        }

        const now = new Date();
        const timeStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

        const proxy = document.getElementById('proxy')?.value.trim() || '';
        const proxyStr = proxy ? `socks5://${proxy}` : '无代理（直连）';

        let report = `${timeStr}\n# 报告由SOCKS5测试工具制作。\n#使用socks5代理：${proxyStr}\n\n`;

        const valid = [], timeout = [], invalid = [];

        batchTestResults.forEach((res, i) => {
            const entry = channelEntries[i] || { name: res.url, group: '默认分组', url: res.url };
            const line = `${entry.name},${res.url}`;

            if (res.success && res.m3u8_valid) {
                valid.push({ line, group: entry.group });
            } else if (!res.success && (res.status_code === 0 || /timed out|Empty reply|connect/i.test(res.error || ''))) {
                timeout.push({ line, group: entry.group });
            } else {
                invalid.push({ line, group: entry.group });
            }
        });

        function writeSection(title, list) {
            if (list.length === 0) return;
            report += `= ${title} =\n`;
            let cur = '';
            list.forEach(item => {
                if (item.group !== cur) {
                    report += `${item.group},#genre#\n`;
                    cur = item.group;
                }
                report += `${item.line}\n`;
            });
            report += '\n';
        }

        writeSection('有效源', valid);
        writeSection('超时源', timeout);
        writeSection('无效源', invalid);

        const blob = new Blob(['\uFEFF' + report], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `测试报告_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);

        addLog('测试报告已导出', 'success');
    }

    function exportLog() {
        if (currentTestLogs.length === 0) {
            alert('没有日志可导出');
            return;
        }
        
        const now = new Date();
        const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        
        let logText = `=== SOCKS5测试工具日志 ===\n`;
        logText += `生成时间: ${new Date().toLocaleString()}\n`;
        logText += `日志数量: ${currentTestLogs.length}条\n`;
        logText += '='.repeat(40) + '\n\n';
        
        currentTestLogs.forEach(log => {
            const typeText = log.type === 'info' ? '[信息]' : 
                           log.type === 'success' ? '[成功]' : 
                           log.type === 'error' ? '[错误]' : 
                           log.type === 'warning' ? '[警告]' : '[未知]';
            logText += `${log.time} ${typeText} ${log.message}\n`;
        });
        
        const blob = new Blob(['\uFEFF' + logText], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `测试日志_${timeStr}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
        
        addLog('日志已导出', 'success');
    }

    // ==================== 初始化执行 ====================
    init();
});