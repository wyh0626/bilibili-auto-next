// B站自动跳P助手 - 内容脚本
class BilibiliAutoNext {
    constructor() {
        this.settings = {
            enabled: false,
            jumpTime: 0,
            jumpMode: 'fixed',
            enableNotification: true
        };
        this.timer = null;
        this.video = null;
        this.currentP = 1;
        this.totalP = 1;
        this.hasJumped = false;
        
        this.init();
    }

    async init() {
        // 加载设置
        await this.loadSettings();
        
        // 直接开始设置，不等待页面加载
        this.setup();
        
        // 监听来自popup的消息
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'updateSettings') {
                this.settings = request.settings;
                this.restart();
            } else if (request.action === 'disable') {
                this.settings.enabled = false;
                this.stop();
            } else if (request.action === 'testJump') {
                console.log('[B站自动跳P] 手动测试跳转');
                this.jumpToNextPart();
            }
        });
    }



    async loadSettings() {
        return new Promise(resolve => {
            chrome.storage.sync.get({
                enabled: false,
                jumpTime: 180,
                jumpMode: 'fixed',
                enableNotification: true
            }, (items) => {
                this.settings = items;
                resolve();
            });
        });
    }

    async setup() {
        // 查找视频元素
        this.findVideoElement();
        
        // 获取分P信息
        await this.getPartInfo();
        
        // 输出调试信息
        console.log(`[B站自动跳P] 页面信息 - 启用状态: ${this.settings.enabled}, 视频元素: ${!!this.video}, 总P数: ${this.totalP}`);
        
        if (this.settings.enabled && this.video && this.totalP > 1) {
            console.log('[B站自动跳P] 满足启动条件，开始监控');
            this.start();
        } else {
            console.log('[B站自动跳P] 不满足启动条件');
            if (!this.settings.enabled) console.log('- 插件未启用');
            if (!this.video) console.log('- 未找到视频元素');
            if (this.totalP <= 1) console.log('- 不是多P视频');
        }

        // 监听页面变化（SPA路由）
        this.observePageChanges();
    }

    findVideoElement() {
        // B站的视频元素选择器
        this.video = document.querySelector('video') || 
                    document.querySelector('.bilibili-player-video video') ||
                    document.querySelector('.bpx-player-video-wrap video');
        
        if (this.video) {
            // 移除之前的事件监听器
            this.video.removeEventListener('loadedmetadata', this.onVideoLoaded);
            this.video.removeEventListener('timeupdate', this.onTimeUpdate);
            
            // 添加事件监听器
            this.video.addEventListener('loadedmetadata', this.onVideoLoaded.bind(this));
            this.video.addEventListener('timeupdate', this.onTimeUpdate.bind(this));
        }
    }

    async getPartInfo() {
        console.log('[B站自动跳P] 开始获取分P信息...');
        
        // 重置数据
        this.currentP = 1;
        this.totalP = 1;
        
        try {
            // 从URL获取BVID
            const bvid = this.getBvidFromUrl();
            if (!bvid) {
                console.log('[B站自动跳P] 无法从URL获取BVID');
                this.logFinalResult();
                return;
            }
            
            console.log(`[B站自动跳P] 获取到BVID: ${bvid}`);
            
            // 调用API获取视频信息
            const videoInfo = await this.getVideoInfo(bvid);
            if (!videoInfo || videoInfo.code !== 0) {
                console.log('[B站自动跳P] API调用失败或返回错误:', videoInfo);
                this.fallbackGetPartInfo();
                return;
            }
            
            const data = videoInfo.data;
            console.log('[B站自动跳P] API返回数据:', data);
            
            // 判断是否为合集视频
            const collectionInfo = this.analyzeCollectionInfo(data);
            
            if (collectionInfo.isCollection) {
                this.totalP = collectionInfo.totalVideos;
                console.log(`[B站自动跳P] ✅ 检测到合集视频，共${this.totalP}P`);
            } else {
                console.log('[B站自动跳P] 这是单P视频');
            }
            
            // 从URL获取当前P数
            const urlMatch = window.location.href.match(/[?&]p=(\d+)/);
            if (urlMatch) {
                this.currentP = parseInt(urlMatch[1]);
            }
            console.log(`[B站自动跳P] 当前P: ${this.currentP}`);
        } catch (error) {
            console.log('[B站自动跳P] 获取视频信息时出错:', error);
            this.fallbackGetPartInfo();
        }
        
        this.logFinalResult();
    }
    
    // 从URL提取BVID
    getBvidFromUrl() {
        const url = window.location.href;
        const bvidMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/);
        return bvidMatch ? bvidMatch[1] : null;
    }
    
    // 调用B站API获取视频信息
    async getVideoInfo(bvid) {
        try {
            const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
                method: 'GET',
                credentials: 'include', // 包含cookie
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': navigator.userAgent
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('[B站自动跳P] API响应:', data);
            return data;
        } catch (error) {
            console.log('[B站自动跳P] API请求失败:', error);
            return null;
        }
    }
    
    // 分析合集信息
    analyzeCollectionInfo(videoData) {
        const collectionInfo = {
            isCollection: false,
            totalVideos: 1,
            pages: [],
            seasonInfo: null
        };
        
        // 检查是否为多P视频
        if (videoData.pages && videoData.pages.length > 1) {
            collectionInfo.isCollection = true;
            collectionInfo.totalVideos = videoData.pages.length;
            collectionInfo.pages = videoData.pages.map(page => ({
                cid: page.cid,
                page: page.page,
                title: page.part,
                duration: page.duration
            }));
            console.log('[B站自动跳P] 检测到多P视频');
        }
        
        // 检查videos字段
        if (videoData.videos && videoData.videos > 1) {
            collectionInfo.isCollection = true;
            collectionInfo.totalVideos = Math.max(collectionInfo.totalVideos, videoData.videos);
            console.log(`[B站自动跳P] videos字段显示${videoData.videos}个视频`);
        }
        
        // 检查是否为新版合集
        if (videoData.ugc_season) {
            collectionInfo.isCollection = true;
            collectionInfo.seasonInfo = {
                id: videoData.ugc_season.id,
                title: videoData.ugc_season.title,
                cover: videoData.ugc_season.cover
            };
            console.log('[B站自动跳P] 检测到新版合集');
        }
        
        return collectionInfo;
    }
    
    // 备用方法：从URL推测
    fallbackGetPartInfo() {
        console.log('[B站自动跳P] 使用备用检测方法');
        
        // 从URL获取当前P
        const urlMatch = window.location.href.match(/[?&]p=(\d+)/);
        if (urlMatch) {
            this.currentP = parseInt(urlMatch[1]);
            console.log(`[B站自动跳P] 从URL解析当前P: ${this.currentP}`);
            
            // 如果URL中有p参数，说明可能是多P视频
            // 保守估计总集数
            this.totalP = Math.max(this.currentP * 2, 10);
            console.log(`[B站自动跳P] 根据URL参数推测总集数: ${this.totalP}`);
        }
    }

    logFinalResult() {
        console.log(`[B站自动跳P] 最终检测结果: 当前第${this.currentP}集, 共${this.totalP}集`);
        console.log(`[B站自动跳P] 当前URL: ${window.location.href}`);

        // 如果检测到多集视频，输出成功信息
        if (this.totalP > 1) {
            console.log('[B站自动跳P] ✅ 成功检测到多集视频');
        } else {
            console.log('[B站自动跳P] ❌ 未检测到多集视频');
            // 输出调试信息
            console.log('调试信息:');
            console.log('- __INITIAL_STATE__ 是否存在:', !!window.__INITIAL_STATE__);
            if (window.__INITIAL_STATE__) {
                console.log('- videoData 是否存在:', !!window.__INITIAL_STATE__.videoData);
                if (window.__INITIAL_STATE__.videoData) {
                    console.log('- videos 数量:', window.__INITIAL_STATE__.videoData.videos);
                    console.log('- pages 数量:', window.__INITIAL_STATE__.videoData.pages ? window.__INITIAL_STATE__.videoData.pages.length : '不存在');
                }
            }
        }
    }

    onVideoLoaded() {
        this.hasJumped = false;
        if (this.settings.enabled && this.totalP > 1) {
            this.start();
        }
    }

    onTimeUpdate() {
        if (!this.settings.enabled || this.hasJumped || this.currentP >= this.totalP) {
            return;
        }

        // 如果跳转时间为0，则不执行跳转
        if (this.settings.jumpTime === 0) {
            return;
        }

        const currentTime = this.video.currentTime;
        const duration = this.video.duration;

        if (!duration || isNaN(duration)) return;

        let shouldJump = false;

        if (this.settings.jumpMode === 'fixed') {
            // 固定时间点模式
            shouldJump = currentTime >= this.settings.jumpTime;
        } else if (this.settings.jumpMode === 'beforeEnd') {
            // 视频结束前模式
            shouldJump = (duration - currentTime) <= this.settings.jumpTime;
        }

        if (shouldJump) {
            this.hasJumped = true;
            this.jumpToNextPart();
        }
    }

    jumpToNextPart() {
        if (this.currentP >= this.totalP && this.totalP > 0) {
            console.log('[B站自动跳P] 已经是最后一集了');
            this.showNotification('已经是最后一集了');
            return;
        }

        const nextP = this.currentP + 1;
        
        if (this.settings.enableNotification) {
            this.showNotification(`自动跳转到第${nextP}集`);
        }

        console.log(`[B站自动跳P] 尝试跳转到第${nextP}集`);

        // 直接修改URL跳转（最可靠的方法）
        this.jumpByUrl(nextP);
    }

    jumpByUrl(nextP) {
        console.log(`[B站自动跳P] 通过URL跳转到第${nextP}集`);
        
        const currentUrl = new URL(window.location.href);
        
        if (nextP === 1) {
            // 第1集删除p参数（默认就是第1集）
            currentUrl.searchParams.delete('p');
        } else {
            // 其他集数设置p参数
            currentUrl.searchParams.set('p', nextP);
        }
        
        const newUrl = currentUrl.toString();
        console.log(`[B站自动跳P] 跳转URL: ${newUrl}`);
        
        // 使用location.href跳转
        window.location.href = newUrl;
        return true;
    }

    showNotification(message) {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = 'bilibili-auto-next-notification';
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // 3秒后移除通知
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    start() {
        this.clearTimer(); // 先清除之前的定时器，不打印停用信息
        console.log('[B站自动跳P] 功能已启用');
    }

    stop() {
        this.clearTimer();
        console.log('[B站自动跳P] 功能已停用');
    }
    
    clearTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    restart() {
        this.stop();
        if (this.settings.enabled && this.video && this.totalP > 1) {
            this.start();
        }
    }

    observePageChanges() {
        // 监听URL变化（SPA路由）
        let lastUrl = location.href;
        const observer = new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                this.setup(); // 直接调用setup，不延迟
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

// 初始化插件
new BilibiliAutoNext();
