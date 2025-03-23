// ==UserScript==
// @name         BestBuy Canada Bot
// @namespace    http://tampermonkey.net/
// @updateURL    https://raw.githubusercontent.com/wenyejig/BestBuy-Canada-Bot/main/cart.js
// @downloadURL  https://raw.githubusercontent.com/wenyejig/BestBuy-Canada-Bot/main/cart.js
// @version      2.1.5
// @description  全功能库存监控+自动结账+状态提示
// @author       Wenyejig
// @match        https://www.bestbuy.ca/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';
    // 初始化标志
    let isInitialized = false;

    // 全局配置
    const config = {
        // 基础配置
        checkInterval: 60000,
        targetSKU: 'YOUR_SKU',
        autoCheckout: true,
        maxRandomDelaySeconds: 30, // 设置最大随机延迟秒数 (例如，30秒)

        // 新增强制配置
        statusPanel: {
            position: 'bottom-right',
            style: {
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                textColor: '#FFFFFF'
            }
        },

        // 凭证配置（加密存储）
        credentials: {
            username: 'encrypted_user',
            password: 'encrypted_pass'
        }
    };

    // 全局状态
    let state = {
        startTime: 0,
        countdown: 0,
        runtime: 0,
        attempts: 0,
        lastRefresh: 0,
        isRunning: true,
        currentPage: null
    };

    // 页面路由配置
    const PAGE = {
        PRODUCT: 'product',
        CART: 'cart',
        CHECKOUT: 'checkout',
        LOGIN: 'login'
    };

    // 样式初始化
    GM_addStyle(`
        #enhanced-status-panel {
            position: fixed;
            ${config.statusPanel.position === 'bottom-right' ?
            'bottom: 20px; right: 20px;' :
            'top: 20px; right: 20px;'}
            background: ${config.statusPanel.style.backgroundColor};
            color: ${config.statusPanel.style.textColor};
            padding: 15px;
            border-radius: 8px;
            z-index: 99999;
            font-family: Arial;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            min-width: 220px;
            transition: opacity 0.3s;
        }
        .status-header {
            font-size: 16px;
            margin-bottom: 10px;
            border-bottom: 1px solid #444;
        }
        .status-item {
            margin: 8px 0;
            font-size: 14px;
        }
        .error-status { color: #FF5555; }
        .success-status { color: #55FF55; }
    `);
    // Play a chime sound to notify the user
    function playChime() {
        // You can choose any online sound file.
        console.log('bot:playChime');
        const chimeUrl = "https://github.com/kkapuria3/BestBuy-GPU-Bot/blob/dev-v2.5-mem_leak_fix/resources/alert.mp3?raw=true";
        const audio = new Audio(chimeUrl);
        audio.play().catch(err => console.error("Audio play failed:", err));
    }
    // 路由变化处理器
    function handleRouteChange() {
        if (isInitialized) {
            console.log('检测到路由变化，重新初始化脚本');
            init();
        }
    }
    // 核心初始化
    function init() {
        detectCurrentPage();
        initStatusPanel();
        restoreState();
        setupPageHandlers();
        startRuntimeCounter();
        isInitialized = true;

    }

    // 页面处理器
    function setupPageHandlers() {
        switch (state.currentPage) {
            case PAGE.PRODUCT:
                handleProductPage();
                setupAutoRefresh();
                break;
            case PAGE.CART:
                handleCartPage();
                break;
            case PAGE.CHECKOUT:
                handleCheckoutPage();
                break;
        }
        console.log('bot:setupPageHandlers', state.currentPage);
    }

    // --- 原有核心功能保持 ---
    // 商品页处理（新增刷新逻辑）
    function handleProductPage() {
        const checkInterval = setInterval(() => {
            if (state.isRunning) {
                checkStock();
                updateStatus(`第 ${state.attempts + 1} 次尝试中...`);
            }
        }, config.checkInterval);

        // 初始化检查
        checkStock();

        // 页面卸载时清理
        window.addEventListener('beforeunload', () => {
            clearInterval(checkInterval);
        });
    }
    function checkStock() {
        const addToCartBtn = document.querySelector('.addToCartButton');
        console.log('bot:checkStock', addToCartBtn);
        if (addToCartBtn && (addToCartBtn.disabled || addToCartBtn.classList.contains('disabled'))) {
            console.log('bot:购物车按钮不可用...');
        } else if (addToCartBtn) {
            addToCartBtn.click();

            // 自动跳转购物车
            setTimeout(() => {
                const viewCartConfirn = document.querySelector('[data-automation="view-cart-confirmation"]');
                if (viewCartConfirn) {
                    if (addToCartBtn.disabled) {
                        console.log('bot:跳转购物车按钮不可用...');
                    } else {
                        document.getElementById('status-bot-message').textContent =
                            `即将跳转cart....`;
                        console.log('bot:即将跳转cart...');
                        humanizedClick(viewCartConfirn);
                    }
                }
            }, 3000);
        }
    }

    // 购物车页处理（保留原有逻辑）
    function handleCartPage() {
        playChime();

        document.getElementById('status-bot-message').textContent =
            ``;

        const proceedToCheckout = () => {
            // 使用增强版按钮定位逻辑
            const checkoutBtn = document.querySelector(
                'a[data-automation="continue-to-checkout"]'// 精准定位
                //   '.checkoutButton_2DdyM > a', // 结构定位
                // 'a:contains("Continue to Checkout")' // 文本定位
            );

            if (checkoutBtn) {
                console.log('检测到结账按钮，准备跳转');
                humanizedClick(checkoutBtn);
            } else {
                console.warn('未找到结账按钮，等待页面加载...');
                setTimeout(proceedToCheckout, 2000);
            }
        };

        // 5秒后 首次尝试
        const interval = 5;
        const gotoCheck = setInterval(() => {
            if (!state.isRunning) return;
            document.getElementById('status-main').textContent =
                `${interval}秒后结算...`;
            if (interval === 0) {
                clearInterval(gotoCheck);
                proceedToCheckout();
            } else {
                interval--;
            }
        }, 1000);

        // 新增SPA页面监听
        const observer = new MutationObserver(() => proceedToCheckout());
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // 结账页处理（保留年龄验证逻辑）
    function handleCheckoutPage() {
        document.getElementById('status-main').textContent =
            `自动结算，请稍等...`;
        // 分阶段处理逻辑
        const processCheckoutSteps = () => {
            const cvvInput = document.getElementById('cvv');
            if (cvvInput) {
                setTimeout(() => {
                    document.getElementById('status-message').textContent =
                        `未找到CVV输入框，等待页面加载完成...`;
                    processCheckoutSteps();
                }, 3000);
            } else {
                // 支付信息自动填充逻辑
                autoFillPaymentInfo();
                setTimeout(() => {
                    // 最终确认按钮
                    // const confirmBtn = document.querySelector('.order-now');
                    // if (confirmBtn) {
                    //     humanizedClick(confirmBtn);
                    // }
                }, 1000);
            }
        };
        //支付信息自动填充逻辑
        const autoFillPaymentInfo = () => {
            const cvvInput = document.getElementById('cvv');
            if (cvvInput) {
                cvvInput.value = "cvv";
                cvvInput.dispatchEvent(new Event('input', { bubbles: true }));
                cvvInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        // 启动处理流程
        setTimeout(processCheckoutSteps, 1000);
    }


    // --- 新增功能模块 ---
    // 状态面板管理
    function initStatusPanel() {
        console.log('bot:initStatusPanel');
        const panel = document.createElement('div');
        panel.id = 'enhanced-status-panel';
        panel.innerHTML = `
            <div class="status-header">🛒 自动助手：运行中</div>
            <div class="status-item" id="status-main">初始化完成</div>
            <div class="status-item" id="status-bot-message"></div>
            <div class="status-item" id="status-runtime"></div>
        `;
        document.body.appendChild(panel);
    }

    // 状态更新方法
    function updateStatus(message, type = 'info') {
        const statusEl = document.getElementById('status-main');
        if (!statusEl) return;

        statusEl.className = `status-item ${type === 'error' ? 'error-status' :
            type === 'success' ? 'success-status' : ''
            }`;
        statusEl.textContent = message;
    }


    // 自动刷新逻辑
    function setupAutoRefresh() {
        console.log('bot:setupAutoRefresh');
        const refresh = () => {
            if (state.currentPage === PAGE.PRODUCT && state.isRunning) {
                window.location.reload();
            }
        };
        //重置时间计数器
        state.countdown = config.checkInterval / 1000;

        // 生成一个介于 0 和 maxRandomDelaySeconds 之间的随机数
        const randomDelay = Math.floor(Math.random() * config.maxRandomDelaySeconds);

        // 将随机延迟加到 countdown 上
        state.countdown += randomDelay;

        setInterval(refresh, config.checkInterval);
        updateStatus(`将在 ${state.countdown} 秒后刷新`);
    }

    // 状态持久化
    function saveState() {
        const timeState = {
            startTime: state.startTime,
            lastRefresh: new Date().getTime(),
        };
        console.log('bot:saveState', timeState);

        GM_setValue('enhancedState', JSON.stringify(timeState));
    }

    function restoreState() {
        const savedStr = GM_getValue('enhancedState');
        if (savedStr) {
            const saved = JSON.parse(savedStr);
            console.log('bot:restoreState', saved);
            if (saved.startTime == 0) {
                state.startTime = new Date().getTime();

            } else {
                const exprTime = (new Date().getTime() - saved.lastRefresh) / 1000;
                console.log('bot:exprTime', exprTime);
                if (exprTime > config.checkInterval) {
                    state.startTime = new Date().getTime();
                } else {
                    state.startTime = saved.startTime;
                }
            }

            console.log('bot:restoreState after startTime', state.startTime);
        }
    }




    // 运行时间计数器
    function startRuntimeCounter() {
        console.log('bot:startRuntimeCounter');
        setInterval(() => {
            state.runtime++;
            const runtime = ((new Date().getTime() - state.startTime) / 1000).toFixed(0);
            console.log('bot:startRuntimeCounter', runtime);
            document.getElementById('status-runtime').textContent =
                `已运行: ${Math.floor(runtime / 60)}分${runtime % 60}秒`;
            if (state.currentPage === PAGE.PRODUCT && state.isRunning) {
                state.countdown--;
                document.getElementById('status-main').textContent =
                    `将在 ${state.countdown} 秒后刷新`;
            }


        }, 1000);
    }

    // 页面类型检测
    function detectCurrentPage() {
        const path = window.location.pathname;
        state.currentPage =
            path.includes('/en-ca/product/') ? PAGE.PRODUCT :
                path.includes('/en-ca/basket') ? PAGE.CART :
                    path.includes('/en-ca/checkout') ? PAGE.CHECKOUT :
                        path.includes('/signin') ? PAGE.LOGIN : null;
        console.log('当前页面:', state.currentPage);
    }
    // 模拟人类点击行为（带随机轨迹）
    function humanizedClick(element) {
        if (!element || !element.isConnected) return;

        // 使用安全的方式获取 window 对象
        const safeWindow = element.ownerDocument.defaultView || window;

        // 创建更规范的事件参数
        const eventParams = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: element.getBoundingClientRect().left + element.offsetWidth / 2,
            clientY: element.getBoundingClientRect().top + element.offsetHeight / 2,
            // 不再显式设置 view 属性
            // 浏览器会自动从当前上下文推断
        };

        // 分阶段触发事件
        element.dispatchEvent(new MouseEvent('mouseover', eventParams));
        element.dispatchEvent(new MouseEvent('mousedown', eventParams));
        element.dispatchEvent(new MouseEvent('mouseup', eventParams));
        element.dispatchEvent(new MouseEvent('click', eventParams));

        // 添加随机行为干扰
        setTimeout(() => {
            element.blur();
            window.scrollBy({
                left: Math.random() * 10 - 5,
                top: Math.random() * 10 - 5,
                behavior: 'smooth'
            });
        }, 100);
    }

    // 监听路由变化
    function setupRouteListener() {
        // 监听 history.pushState 和 history.replaceState
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function () {
            originalPushState.apply(this, arguments);
            handleRouteChange();
        };

        history.replaceState = function () {
            originalReplaceState.apply(this, arguments);
            handleRouteChange();
        };

        // 监听 popstate 事件（用户点击后退/前进按钮）
        window.addEventListener('popstate', handleRouteChange);
    }

    // 初始化执行
    window.addEventListener('load', () => {
        setTimeout(() => {
            init();
            setupRouteListener();
        }, 3000); // 等待页面稳定
    });

    // 清理状态
    window.addEventListener('beforeunload', () => {
        saveState();
    });
})();