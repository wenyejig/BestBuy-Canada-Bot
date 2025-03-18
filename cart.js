// ==UserScript==
// @name         BestBuy Canada Bot
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  全自动库存监控+购物车操作+登录处理
// @author       YourName
// @match        https://www.bestbuy.ca/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // 配置参数
    const config = {
        credentials: {
            username: 'YOUR_EMAIL',    // 替换为实际账号
            password: 'YOUR_PASSWORD'  // 替换为实际密码
        },
        checkInterval: 30000,         // 库存检查间隔
        maxRetries: 3,                // 失败重试次数
        autoCheckout: true            // 启用自动结账
    };

    // 页面路由配置
    const routeConfig = {
        productPage: /\/en-ca\/product\//,
        cartPage: /\/en-ca\/basket/,
        checkoutPage: /\/checkout\//, // 新增结账页面识别
        loginPage: /\/authentication\/en-ca\/signin/
    };

    // 初始化路由监听
    let currentUrl = window.location.href;
    setInterval(checkUrlChange, 1000);

    // 页面路由处理器
    function handlePageRouting() {
        switch (true) {
            case routeConfig.productPage.test(currentUrl):
                handleProductPage();
                break;
            case routeConfig.cartPage.test(currentUrl):
                handleCartPage();
                break;
            case routeConfig.checkoutPage.test(currentUrl): // 结账流程页面
                handleCheckoutPage(); // 新增专用处理器
                break;
            case routeConfig.loginPage.test(currentUrl):
                handleLoginPage();
                break;
        }
    }

    // 商品详情页处理
    function handleProductPage() {
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

    // 购物车页处理
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
    // 专门处理结账页面的复杂交互
    function handleCheckoutPage() {
        // 关闭年龄验证弹窗
        // const closeAgeGate = () => {
        //     const closeBtn = document.querySelector('.ageVerification_1SBZe .closeIcon');
        //     if (closeBtn) {
        //         console.log('关闭年龄限制弹窗');
        //         closeBtn.click();
        //         return true;
        //     }
        //     return false;
        // };

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

    // 登录页处理
    function handleLoginPage() {
        const loginForm = document.querySelector('form[action="/authentication/en-ca/signin"]');

        if (loginForm) {
            // 自动填充表单
            const emailField = loginForm.querySelector('#username');
            const passwordField = loginForm.querySelector('#password');

            if (emailField && passwordField) {
                emailField.value = config.credentials.username;
                passwordField.value = config.credentials.password;

                // 自动提交
                setTimeout(() => {
                    loginForm.submit();
                }, 1000);
            }
        }
    }

    // URL变化检测
    function checkUrlChange() {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            handlePageRouting();
        }
    }

    // 初始化执行
    handlePageRouting();

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


    // 跨页面状态管理
    window.addEventListener('beforeunload', () => {
        GM_setValue('checkoutInProgress', true);
    });

    window.addEventListener('load', () => {
        if (GM_getValue('checkoutInProgress')) {
            GM_deleteValue('checkoutInProgress');
            handlePageRouting();
        }
    });
})();