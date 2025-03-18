// ==UserScript==
// @name         BestBuy Canada Bot
// @namespace    http://tampermonkey.net/
// @updateURL    https://raw.githubusercontent.com/wenyejig/BestBuy-Canada-Bot/blob/main/cart.js
// @downloadURL  https://raw.githubusercontent.com/wenyejig/BestBuy-Canada-Bot/blob/main/cart.js
// @version      2.1
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
            case PAGE.LOGIN:
                handleLoginPage();
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

    // 购物车页处理（保留原有逻辑）
    function handleCartPage() {
        const checkoutBtn = document.querySelector('[data-automation="checkout-button"]');
        if (checkoutBtn) {
            humanizedClick(checkoutBtn);
        } else {
            handleCheckoutError();
        }
    }

    // 结账页处理（保留年龄验证逻辑）
    function handleCheckoutPage() {
        handleAgeVerification();
        autoFillPaymentInfo();
    }

    // 登录页处理（保留自动填充）
    function handleLoginPage() {
        autoFillLoginForm();
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

        setInterval(refresh, config.checkInterval);
        updateStatus(`将在 ${config.checkInterval / 1000} 秒后刷新`);
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
            document.getElementById('status-runtime').textContent =
                `已运行: ${Math.floor(state.runtime / 60)}分${state.runtime % 60}秒`;
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

    // 初始化执行
    window.addEventListener('load', () => {
        setTimeout(init, 3000); // 等待页面稳定
    });

    // 清理状态
    window.addEventListener('beforeunload', () => {
        saveState();
    });
})();