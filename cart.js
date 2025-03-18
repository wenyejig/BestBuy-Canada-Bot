// ==UserScript==
// @name         BestBuy Canada Bot
// @namespace    http://tampermonkey.net/
// @updateURL    https://raw.githubusercontent.com/wenyejig/BestBuy-Canada-Bot/main/cart.js
// @downloadURL  https://raw.githubusercontent.com/wenyejig/BestBuy-Canada-Bot/main/cart.js
// @version      2.1.3
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

    // 全局配置
    const config = {
        // 基础配置
        checkInterval: 60000,
        targetSKU: 'YOUR_SKU',
        autoCheckout: true,

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

    // 核心初始化
    function init() {
        detectCurrentPage();
        initStatusPanel();
        restoreState();
        setupPageHandlers();
        startRuntimeCounter();
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
        const addToCartBtn = document.querySelector('.addToCartButton:not([disabled])');

        if (addToCartBtn) {
            addToCartBtn.click();
            GM_notification({
                title: "库存可用！",
                text: "商品已加入购物车",
                timeout: 3000
            });

            // 自动跳转购物车
            setTimeout(() => {
                window.location.href = 'https://www.bestbuy.ca/en-ca/basket';
            }, 2000);
        } else {
            console.log('定期库存检查...');
        }
    }

    // 购物车页处理（保留原有逻辑）
    function handleCartPage() {
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

        // 首次尝试
        proceedToCheckout();

        // 新增SPA页面监听
        const observer = new MutationObserver(() => proceedToCheckout());
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // 结账页处理（保留年龄验证逻辑）
    function handleCheckoutPage() {
        // 分阶段处理逻辑
        const processCheckoutSteps = () => {
            if (closeAgeGate()) {
                setTimeout(processCheckoutSteps, 1000);
                return;
            }

            // 支付信息自动填充逻辑
            autoFillPaymentInfo();

            // 最终确认按钮
            const confirmBtn = document.querySelector('[data-automation="place-order-button"]');
            if (confirmBtn) {
                humanizedClick(confirmBtn);
            }
        };

        // 启动处理流程
        setTimeout(processCheckoutSteps, 3000);
    }


    // --- 新增功能模块 ---
    // 状态面板管理
    function initStatusPanel() {
        const panel = document.createElement('div');
        panel.id = 'enhanced-status-panel';
        panel.innerHTML = `
            <div class="status-header">🛒 自动助手</div>
            <div class="status-item" id="status-main">初始化完成</div>
            <div class="status-item" id="status-timer"></div>
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
        const refresh = () => {
            if (state.currentPage === PAGE.PRODUCT && state.isRunning) {
                window.location.reload();
            }
        };
        //重置时间计数器
        state.countdown = config.checkInterval / 1000;

        setInterval(refresh, config.checkInterval);
        updateStatus(`将在 ${state.countdown} 秒后刷新`);
    }

    // 状态持久化
    function saveState() {
        GM_setValue('enhancedState', JSON.stringify(state));
    }

    function restoreState() {
        const saved = GM_getValue('enhancedState');
        if (saved) Object.assign(state, JSON.parse(saved));
    }

    // 运行时间计数器
    function startRuntimeCounter() {
        setInterval(() => {
            state.runtime++;
            state.countdown--;

            document.getElementById('status-runtime').textContent =
                `已运行: ${Math.floor(state.runtime / 60)}分${state.runtime % 60}秒`;
            document.getElementById('status-runtime').textContent =
                `将在 ${state.countdown} 秒后刷新`;

        }, 1000);
    }

    // 页面类型检测
    function detectCurrentPage() {
        const path = window.location.pathname;
        state.currentPage =
            path.includes('/product/') ? PAGE.PRODUCT :
                path.includes('/basket') ? PAGE.CART :
                    path.includes('/checkout') ? PAGE.CHECKOUT :
                        path.includes('/signin') ? PAGE.LOGIN : null;
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
    // 初始化执行
    window.addEventListener('load', () => {
        setTimeout(init, 3000); // 等待页面稳定
    });

    // 清理状态
    window.addEventListener('beforeunload', () => {
        saveState();
    });
})();