document.addEventListener('DOMContentLoaded', function() {
    const jumpHoursInput = document.getElementById('jumpHours');
    const jumpMinutesInput = document.getElementById('jumpMinutes');
    const jumpSecondsInput = document.getElementById('jumpSeconds');
    const jumpModeSelect = document.getElementById('jumpMode');
    const enableNotificationCheckbox = document.getElementById('enableNotification');
    const enableBtn = document.getElementById('enableBtn');
    const disableBtn = document.getElementById('disableBtn');
    const testBtn = document.getElementById('testBtn');
    const statusDiv = document.getElementById('status');

    // 时间转换函数
    function secondsToHMS(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return { hours, minutes, seconds: secs };
    }

    function hmsToSeconds(hours, minutes, seconds) {
        const h = parseInt(hours) || 0;
        const m = parseInt(minutes) || 0;
        const s = parseInt(seconds) || 0;
        return h * 3600 + m * 60 + s;
    }

    // 加载已保存的设置
    chrome.storage.sync.get({
        enabled: false,
        jumpTime: 0,
        jumpMode: 'fixed',
        enableNotification: true
    }, function(items) {
        const time = secondsToHMS(items.jumpTime);
        jumpHoursInput.value = time.hours;
        jumpMinutesInput.value = time.minutes;
        jumpSecondsInput.value = time.seconds;
        jumpModeSelect.value = items.jumpMode;
        enableNotificationCheckbox.checked = items.enableNotification;
        updateStatus(items.enabled);
    });

    // 启用按钮
    enableBtn.addEventListener('click', function() {
        const jumpTime = hmsToSeconds(
            jumpHoursInput.value,
            jumpMinutesInput.value,
            jumpSecondsInput.value
        ); // 如果所有值都为0，则为0秒
        
        const settings = {
            enabled: true,
            jumpTime: jumpTime,
            jumpMode: jumpModeSelect.value,
            enableNotification: enableNotificationCheckbox.checked
        };

        chrome.storage.sync.set(settings, function() {
            updateStatus(true);
            // 通知content script设置已更新
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0] && tabs[0].url.includes('bilibili.com')) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'updateSettings',
                        settings: settings
                    });
                }
            });
        });
    });

    // 停用按钮
    disableBtn.addEventListener('click', function() {
        chrome.storage.sync.set({enabled: false}, function() {
            updateStatus(false);
            // 通知content script停用
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0] && tabs[0].url.includes('bilibili.com')) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'disable'
                    });
                }
            });
        });
    });

    // 测试跳转按钮
    testBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0] && tabs[0].url.includes('bilibili.com')) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'testJump'
                });
            }
        });
    });

    function updateStatus(enabled) {
        if (enabled) {
            statusDiv.textContent = '状态: 已启用';
            statusDiv.className = 'status enabled';
        } else {
            statusDiv.textContent = '状态: 已停用';
            statusDiv.className = 'status disabled';
        }
    }
});
