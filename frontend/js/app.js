(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const screen = $('#screen');
  const modalRoot = $('#modalRoot');
  const searchInput = $('#globalSearch');
  const navItems = [
    { id: 'home', label: 'HOME' },
    { id: 'watchlist', label: 'WATCHLIST' },
    { id: 'portfolio', label: 'PORTFOLIO' },
    { id: 'orders', label: 'ORDERS' },
    { id: 'account', label: 'ACCOUNT' }
  ];
  const navIcons = {
    home: '<svg class="tab-svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M5.5 14.5 16 5.5l10.5 9L25 26.5H7L5.5 14.5Z"/><path d="M16 16.5v5"/></svg>',
    watchlist: '<svg class="tab-svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="5.8" y="5.5" width="20.4" height="21" rx="1.5"/><path d="m16 10 1.85 3.75 4.15.6-3 2.9.7 4.15L16 19.45l-3.7 1.95.7-4.15-3-2.9 4.15-.6L16 10Z"/></svg>',
    portfolio: '<svg class="tab-svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M4.8 10.5V8.2A2.2 2.2 0 0 1 7 6h6.1l3 3H25a2.2 2.2 0 0 1 2.2 2.2v13.1a2.2 2.2 0 0 1-2.2 2.2H7a2.2 2.2 0 0 1-2.2-2.2V10.5Z"/><path d="M13.4 17.8h5.2"/></svg>',
    orders: '<svg class="tab-svg tab-svg-filled" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="7.3" y="6.3" width="17.4" height="22.2" rx="2.5"/><rect x="12" y="3.2" width="8" height="6.3" rx="2.1"/></svg>',
    account: '<svg class="tab-svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="m4.5 12 16.8-6a2.2 2.2 0 0 1 2.8 1.4l1.2 3.4"/><path d="M5.4 12.1h20.2v13.5a2.2 2.2 0 0 1-2.2 2.2H7.6a2.2 2.2 0 0 1-2.2-2.2V12.1Z"/><path d="M21.4 15.4h6v5.2h-6a2.6 2.6 0 0 1 0-5.2Z"/><text x="9.3" y="22.4" class="wallet-rupee">₹</text></svg>'
  };
  const productChoices = [
    { value: 'INTRADAY', label: 'INTRADAY' },
    { value: 'DELIVERY / CNC', label: 'DELIVERY' },
    { value: 'CF', label: 'CF' }
  ];
  let state = null;
  let currentScreen = 'orders';
  let orderView = 'positions';
  let query = '';
  let searchOpen = false;
  let filterOpen = false;
  let filterValue = 'ALL';
  let menuOpen = false;
  let menuLevel = 'root';
  let totalExpanded = false;
  let reportKind = 'statement';
  let marketOn = localStorage.getItem('simulator-market-on') === 'true';
  let marketTimer = null;
  let toastTimer;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const money = value => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Number(value) || 0);
  const signedMoney = value => {
    const amount = Number(value) || 0;
    return `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${money(Math.abs(amount))}`;
  };
  const formatNumber = value => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const moneyClass = value => Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : 'neutral';
  const direction = position => position.position_type === 'SELL' ? -1 : 1;
  const totalQty = position => SimCalculations.totalQuantity(position);
  function positionPnL(position) {
    if (['MANUAL', 'RANGE'].includes(position.pnl_mode) && position.manual_pnl_pct !== null && position.manual_pnl_pct !== undefined) {
      return Math.round((Number(position.average_price || 0) * totalQty(position) * Number(position.manual_pnl_pct) / 100 * direction(position) + Number.EPSILON) * 100) / 100;
    }
    return SimCalculations.calculatePositionPnL(position);
  }
  function priceChangePct(position) { return SimCalculations.calculatePriceChangePct(position); }
  const priceChangeLabel = position => `${priceChangePct(position) > 0 ? '+' : ''}${priceChangePct(position).toFixed(2)}%`;
  function fitTextarea(field) { if (!field || field.tagName !== 'TEXTAREA') return; field.style.height = 'auto'; field.style.height = `${field.scrollHeight}px`; }
  function fitTextareas(root = screen) { root.querySelectorAll('textarea.inline-name,textarea.contract-name-input').forEach(fitTextarea); }
  const timeLabel = value => {
    if (!value) return '—';
    const date = new Date(String(value).includes('T') ? value : `${value.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const toast = (message, error = false) => {
    const root = $('#toastRoot');
    root.innerHTML = `<div class="toast ${error ? 'toast-error' : ''}" role="status">${escapeHtml(message)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { root.innerHTML = ''; }, 3200);
  };
  async function refresh({ quiet = false } = {}) {
    if (!quiet) $('#refreshButton')?.classList.add('is-loading');
    try {
      state = await API.state();
      render();
    } catch (error) {
      if (!state) screen.innerHTML = `<section class="empty-screen"><div class="empty-chart">!</div><h2>Can’t connect to the simulator</h2><p>${escapeHtml(error.message)}</p><button class="button button-primary" data-action="refresh">Try again</button></section>`;
      toast(error.message, true);
    } finally {
      $('#refreshButton')?.classList.remove('is-loading');
    }
  }
  function navigationMarkup() {
    return navItems.map(item => `<button class="nav-tab ${currentScreen === item.id ? 'active' : ''}" data-screen="${item.id}" aria-label="${item.label}" ${currentScreen === item.id ? 'aria-current="page"' : ''}><span class="nav-icon">${navIcons[item.id]}</span><span class="nav-label">${item.label}</span></button>`).join('');
  }
  function renderHeader() {
    const isOrders = currentScreen === 'orders';
    $('#orderSwitch').classList.toggle('hidden', !isOrders);
    $('#pageTitle').classList.toggle('hidden', isOrders);
    $('#pageTitle').textContent = ({ home: 'Home', watchlist: 'Watchlist', portfolio: 'Portfolio', account: 'Your Account', reports: 'Reports & Statement', reportDetail: 'Report', pnl: 'Profit & Loss' })[currentScreen] || 'Trading Simulator';
    $('#searchButton').classList.toggle('hidden', !isOrders && !['watchlist', 'portfolio'].includes(currentScreen));
    $('#filterButton').classList.add('hidden');
    $('#overflowButton').classList.toggle('hidden', !isOrders);
    $('#searchPanel').classList.toggle('hidden', !searchOpen);
    $('#quoteStrip').classList.toggle('hidden', !isOrders);
    const marketTag = $('#marketStatusTag');
    if (marketTag) marketTag.textContent = marketOn ? 'MARKET ON' : 'MARKET DATA';
    $('#mobileNav').innerHTML = navigationMarkup();
    const ordersButton = $('#tab-positions');
    ordersButton?.classList.toggle('selected', orderView === 'positions');
    $('#tab-orders')?.classList.toggle('selected', orderView === 'orders');
    renderQuotes();
  }
  function renderQuotes() {
    const wanted = ['BANKEX', 'NIFTY 50'];
    const quotes = wanted.map(symbol => state?.markets?.find(item => item.symbol === symbol)).filter(Boolean);
    $('#quoteStrip').innerHTML = `${quotes.map((item, index) => {
      const delta = Number(item.price) * Number(item.change_percent) / 100;
      return `<article class="quote-item ${index ? 'quote-divider' : ''}"><div class="quote-top"><strong>${escapeHtml(item.symbol)}</strong>${index === 0 ? '<span class="expiry-tag">Expiry 25 Mar</span>' : ''}</div><div class="quote-values"><strong>${money(item.price).replace('₹', '₹')}</strong><span>${delta >= 0 ? '+' : '−'}${money(Math.abs(delta)).replace('₹', '')} (${Number(item.change_percent) >= 0 ? '+' : ''}${Number(item.change_percent).toFixed(2)}%)</span></div></article>`;
    }).join('')}<span class="sim-data-mark" id="marketStatusTag">${marketOn ? 'MARKET ON' : 'MARKET DATA'}</span>`;
  }
  function render() {
    if (!state) return;
    document.body.classList.toggle('account-active', currentScreen === 'account');
    renderHeader();
    const pages = {
      home: homePage,
      watchlist: watchlistPage,
      portfolio: portfolioPage,
      orders: ordersPage,
      account: accountPage,
      reports: reportsPage,
      reportDetail: reportDetailPage,
      pnl: pnlPage
    };
    screen.innerHTML = (pages[currentScreen] || ordersPage)();
    const showTotal = currentScreen === 'orders' && orderView === 'positions';
    $('#positionTotal').classList.toggle('hidden', !showTotal);
    if (showTotal) updateTotalBar();
    document.body.classList.toggle('positions-active', showTotal);
    syncMarketTimer();
  }
  function openScreen(id) {
    if (!id || id === currentScreen) return;
    currentScreen = id;
    searchOpen = false;
    searchInput.value = '';
    closeMenu();
    closeSheet();
    history.pushState({ screen: id }, '', `#${id}`);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function symbolSearch(value) {
    const search = String(value || '').trim().toLowerCase();
    if (!search) return true;
    return JSON.stringify(value).toLowerCase().includes(search);
  }
  function filteredPositions() {
    let positions = [...(state?.positions || [])];
    const term = searchInput.value.trim().toLowerCase();
    if (term) positions = positions.filter(position => `${position.symbol} ${position.company_name}`.toLowerCase().includes(term));
    if (filterValue === 'BUY' || filterValue === 'SELL') positions = positions.filter(position => position.position_type === filterValue);
    if (filterValue === 'PROFIT') positions = positions.filter(position => positionPnL(position) > 0);
    if (filterValue === 'LOSS') positions = positions.filter(position => positionPnL(position) < 0);
    return positions;
  }
  const displayProductType = value => String(value || '').toUpperCase() === 'NORMAL' ? 'CF' : String(value || '').toUpperCase();
  function productOptions(selected) {
    const visible = displayProductType(selected);
    return productChoices.map(choice => `<option value="${escapeHtml(choice.value)}" ${visible === choice.value ? 'selected' : ''}>${escapeHtml(choice.label)}</option>`).join('');
  }
  function splitContractName(value) {
    // Keep any editable ticker separate from the option details beginning at the expiry date.
    const match = String(value || '').trim().match(/^(.+?)\s+(\d{1,2}[-\s][A-Z]{3,4}[-\s]\d{2,4}\b.*)$/i);
    if (!match) return null;
    const ticker = match[1].trim();
    const details = match[2].replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\b/gi, month => month[0].toUpperCase() + month.slice(1).toLowerCase());
    return { ticker, details };
  }
  function contractNameMarkup(position) {
    const name = String(position.symbol || position.company_name || '');
    const option = splitContractName(name);
    if (!option) return `<textarea class="inline-name" aria-label="Position name" data-position-field="symbol" data-id="${position.id}" maxlength="50" spellcheck="false" rows="1">${escapeHtml(name)}</textarea>`;
    return `<div class="inline-name inline-contract-name" role="textbox" aria-label="Position name" aria-multiline="false" contenteditable="true" spellcheck="false" data-position-field="symbol" data-id="${position.id}"><span class="contract-ticker">${escapeHtml(option.ticker)}</span><span class="contract-details"> ${escapeHtml(option.details)}</span></div>`;
  }
  function contractNameContents(position) {
    const name = String(position.symbol || position.company_name || '');
    const option = splitContractName(name);
    if (!option) return escapeHtml(name);
    return `<span class="contract-ticker">${escapeHtml(option.ticker)}</span><span class="contract-details"> ${escapeHtml(option.details)}</span>`;
  }
  function closedPositionRow(position) {
    const name = String(position.symbol || position.company_name || '');
    const option = /\b\d{1,2}[-\s][A-Z]{3,4}[-\s]\d{2,4}\b.*\b(?:CE|PE)\b/i.test(name);
    const originalSide = String(position.position_type || 'BUY').toUpperCase();
    const leftSide = option ? 'Buy' : (originalSide === 'SELL' ? 'Sell' : 'Buy');
    const rightSide = option ? 'Sell' : (originalSide === 'SELL' ? 'Buy' : 'Sell');
    const pnl = Number(position.realized_pnl ?? positionPnL(position));
    const quantityMode = String(position.quantity_mode || 'LOTS').toUpperCase();
    const quantityLabel = quantityMode === 'LOTS' ? `${formatNumber(position.quantity)} ${Number(position.quantity) === 1 ? 'Lot' : 'Lots'}` : `${formatNumber(totalQty(position))} Qty`;
    const productLabel = displayProductType(position.product_type) === 'DELIVERY / CNC' ? 'CNC' : displayProductType(position.product_type);
    return `<article class="closed-position-row" data-closed-row-id="${position.id}">
      <div class="closed-position-top"><div class="closed-position-name">${contractNameContents(position)}</div><strong class="closed-position-pnl ${moneyClass(pnl)}">${signedMoney(pnl)}</strong></div>
      <div class="closed-position-middle"><span>${escapeHtml(quantityLabel)}</span><span class="closed-dot">•</span><span class="closed-product">${escapeHtml(productLabel)}</span><span class="closed-ltp">LTP ${money(position.current_price)} (${priceChangeLabel(position)})</span></div>
      <div class="closed-position-prices"><span>${leftSide} ${money(position.average_price)}</span><span>${rightSide} ${money(position.current_price)}</span></div>
    </article>`;
  }
  function positionRow(position) {
    const pnl = positionPnL(position);
    const rowName = position.symbol || position.company_name;
    const quantityMode = String(position.quantity_mode || 'LOTS').toUpperCase();
    const lotText = quantityMode === 'LOTS' && Number(position.lot_size) > 1 ? `<span class="lot-size-note">(1 Lot = ${formatNumber(position.lot_size)})</span>` : '';
    return `<div class="swipe-wrap" data-wrap-id="${position.id}">
      <button class="delete-swipe" data-action="delete-position" data-id="${position.id}" aria-label="Delete ${escapeHtml(rowName)}"><span>▣</span><b>Delete Entry</b></button>
      <article class="position-row" data-row-id="${position.id}">
        <div class="position-first-line">${contractNameMarkup(position)}<button class="row-pnl ${moneyClass(pnl)}" data-action="edit-pnl" data-id="${position.id}" aria-label="Edit P&L calculation">${signedMoney(pnl)}</button></div>
        <div class="position-second-line"><div class="lot-average"><div class="quantity-entry ${quantityMode === 'QUANTITY' ? 'quantity-entry-units' : ''}"><button type="button" class="quantity-mode-chip" data-action="toggle-quantity-mode" data-id="${position.id}" aria-label="Switch quantity mode to ${quantityMode === 'LOTS' ? 'Quantity' : 'Lots'}">${quantityMode === 'LOTS' ? 'Lots' : 'Qty'}</button><input class="inline-quantity" type="number" min="0.01" step="any" inputmode="decimal" aria-label="${quantityMode === 'LOTS' ? 'Lots' : 'Quantity'}" data-position-field="quantity" data-id="${position.id}" value="${escapeHtml(position.quantity)}"></div><span class="dot-separator">•</span><label>Avg <span class="currency-input">₹</span><input class="inline-average" type="number" min="0" step="any" inputmode="decimal" aria-label="Average price" data-position-field="average_price" data-id="${position.id}" value="${escapeHtml(position.average_price)}"></label></div><div class="ltp-group"><button class="ltp-tap" data-action="edit-ltp" data-id="${position.id}" aria-label="Set LTP">LTP ${money(position.current_price)}</button><button class="change-pct-tap ${priceChangePct(position) >= 0 ? 'positive' : 'negative'} ${position.change_pct_mode === 'RANGE' ? 'range-mode' : ''}" type="button" data-action="edit-change-percent" data-id="${position.id}" aria-label="Edit price change percentage">(${priceChangeLabel(position)})</button></div></div>
        <div class="position-third-line"><div class="position-tags"><button class="side-chip ${position.position_type.toLowerCase()}" data-action="toggle-side" data-id="${position.id}">${escapeHtml(position.position_type)}</button><select class="product-chip" aria-label="Product type" data-position-field="product_type" data-id="${position.id}">${productOptions(position.product_type)}</select>${lotText}</div><button class="exit-market" data-action="exit-position" data-id="${position.id}">EXIT AT MARKET</button></div>
      </article>
    </div>`;
  }
  function marketToolbar() {
    return `<div class="orders-toolbar"><div class="toolbar-left"><button class="toolbar-icon" data-action="toggle-filter" aria-label="Filter positions">☷</button><button class="toolbar-icon" data-action="toggle-search" aria-label="Search positions">⌕</button></div><div class="toolbar-right"><button class="text-action" data-action="secure-exit"><span class="shield-icon">♢</span> SECURE EXIT</button><button class="text-action" data-action="exit-all"><span>↗</span> EXIT ALL</button></div></div>`;
  }
  function emptyPositions() {
    return `<section class="empty-screen"><svg class="empty-chart" viewBox="0 0 100 100" aria-hidden="true"><path d="M15 80h12V59H15zm24 0h12V39H39zm24 0h12V49H63zm24 0h12V24H87z" fill="#dce8ff"/><path d="M12 63l24-19 18 9 27-27" fill="none" stroke="#68aaf2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M72 26h10v10" fill="none" stroke="#68aaf2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><h2>No open positions right now</h2><p>Place an order to create a position.</p><button class="button button-primary" data-action="new-position-menu">＋ Add New Position</button></section>`;
  }
  function ordersPage() {
    if (orderView === 'orders') return orderHistoryPage();
    const positions = filteredPositions();
    const filters = filterOpen ? `<div class="filter-strip"><button data-action="filter-choice" data-filter="ALL" class="${filterValue === 'ALL' ? 'active' : ''}">All</button><button data-action="filter-choice" data-filter="BUY" class="${filterValue === 'BUY' ? 'active' : ''}">BUY</button><button data-action="filter-choice" data-filter="SELL" class="${filterValue === 'SELL' ? 'active' : ''}">SELL</button><button data-action="filter-choice" data-filter="PROFIT" class="${filterValue === 'PROFIT' ? 'active' : ''}">Profit</button><button data-action="filter-choice" data-filter="LOSS" class="${filterValue === 'LOSS' ? 'active' : ''}">Loss</button></div>` : '';
    const closedPositions = (state.closedPositions || []).slice(0, 30);
    const rows = `${positions.map(positionRow).join('')}${closedPositions.map(closedPositionRow).join('')}`;
    return `${marketToolbar()}${filters}<div class="positions-list" id="positionsList">${positions.length || closedPositions.length ? rows : emptyPositions()}</div>`;
  }
  function orderHistoryPage() {
    const search = searchInput.value.trim().toLowerCase();
    const orders = (state.orders || []).filter(order => !search || `${order.symbol} ${order.transaction_type}`.toLowerCase().includes(search));
    return `<div class="orders-toolbar history-toolbar"><div class="toolbar-left"><span class="screen-kicker">ORDER HISTORY</span></div><button class="text-action" data-action="new-position-menu">＋ ADD NEW</button></div>${orders.length ? `<div class="history-list">${orders.map(order => `<article class="history-row"><div class="history-row-top"><strong>${escapeHtml(order.symbol)}</strong><span class="side-chip ${String(order.transaction_type).toLowerCase()}">${escapeHtml(order.transaction_type)}</span><span class="history-status">${escapeHtml(order.status)}</span></div><div class="history-row-bottom"><span>${formatNumber(order.quantity)} Qty · ${escapeHtml(displayProductType(order.product_type))}</span><strong>${money(order.price)}</strong></div><small>${timeLabel(order.created_at)}</small></article>`).join('')}</div>` : `<section class="empty-screen"><div class="empty-chart">▤</div><h2>No orders yet</h2><p>Orders will appear here.</p><button class="button button-primary" data-action="new-position-menu">Add New Position</button></section>`}`;
  }
  function homePage() {
    const markets = (state.markets || []).filter(item => ['BANKEX', 'NIFTY 50', 'GOLD', 'SILVER'].includes(item.symbol));
    const pnl = Number(state.totals.pnl) + Number(state.report.netPnL || 0);
    return `<section class="home-intro"><span class="screen-kicker">TRADING ACCOUNT</span><h2>Good trading<br>starts with a plan.</h2><p>Practice with  prices. No real orders or funds.</p><button class="button button-primary" data-screen="orders">Open positions <span>→</span></button></section><section class="summary-card"><div class="summary-label">TOTAL P&amp;L </div><strong class="${moneyClass(pnl)}">${signedMoney(pnl)}</strong><div class="summary-meta"><span>Available balance</span><b>${money(state.account.available_balance)}</b></div></section><div class="section-heading"><h2>Market watch</h2></div><div class="home-market-list">${markets.map(item => `<div class="home-market-row"><div><strong>${escapeHtml(item.symbol)}</strong><small>Index</small></div><div class="home-market-value"><b>${money(item.price)}</b><span class="${Number(item.change_percent) >= 0 ? 'positive' : 'negative'}">${Number(item.change_percent) > 0 ? '+' : ''}${Number(item.change_percent).toFixed(2)}%</span></div></div>`).join('')}</div><div class="section-heading"><h2>Open positions</h2><button data-screen="orders">See all →</button></div>${state.positions.length ? state.positions.slice(0, 3).map(positionRow).join('') : `<div class="compact-empty">Your positions will appear here.</div>`}`;
  }
  function watchlistPage() {
    const term = searchInput.value.trim().toLowerCase();
    const items = (state.watchlist || []).filter(item => !term || `${item.symbol} ${item.company_name}`.toLowerCase().includes(term));
    const marketItems = (state.markets || []).filter(item => !['Indices', 'Commodities'].includes(item.category)).slice(0, 8);
    return `<div class="page-section-head"><div><span class="screen-kicker">TRACKING</span><h2>My Watchlist</h2></div><button class="round-action" data-action="add-watch" aria-label="Add symbol">＋</button></div>${items.length ? `<div class="plain-list">${items.map(item => `<div class="watchlist-row"><div class="watch-symbol"><b>${escapeHtml(item.symbol)}</b><small>${escapeHtml(item.company_name || 'Instrument')}</small></div><div class="watch-price"><b>${money(item.price || 0)}</b><span class="${Number(item.change_percent) >= 0 ? 'positive' : 'negative'}">${Number(item.change_percent) > 0 ? '+' : ''}${Number(item.change_percent || 0).toFixed(2)}%</span></div><button class="icon-text-button remove-watch" data-action="remove-watch" data-id="${item.id}">×</button></div>`).join('')}</div>` : `<div class="compact-empty">${state.watchlist.length ? 'No matching symbols.' : 'Your watchlist is empty. Add a symbol to follow it.'}</div>`}<div class="section-heading"><h2>Explore symbols</h2></div><div class="plain-list">${marketItems.map(item => `<div class="watchlist-row"><div class="watch-symbol"><b>${escapeHtml(item.symbol)}</b><small>${escapeHtml(item.label)}</small></div><div class="watch-price"><b>${money(item.price)}</b><span class="${Number(item.change_percent) >= 0 ? 'positive' : 'negative'}">${Number(item.change_percent) > 0 ? '+' : ''}${Number(item.change_percent).toFixed(2)}%</span></div><button class="icon-text-button" data-action="quick-watch" data-symbol="${escapeHtml(item.symbol)}">＋</button></div>`).join('')}</div>`;
  }
  function portfolioPage() {
    const totalValue = Number(state.account.available_balance) + Number(state.totals.current);
    return `<section class="balance-summary"><span class="screen-kicker">TOTAL PORTFOLIO VALUE</span><strong>${money(totalValue)}</strong><div class="portfolio-overview"><div><small>Invested</small><b>${money(state.totals.invested)}</b></div><div><small>Unrealized P&amp;L</small><b class="${moneyClass(state.totals.pnl)}">${signedMoney(state.totals.pnl)}</b></div></div></section><div class="section-heading"><h2>Holdings</h2><button data-screen="orders">Edit positions →</button></div>${state.positions.length ? `<div class="plain-list">${state.positions.map(position => `<div class="holding-row"><div><b>${escapeHtml(position.symbol)}</b><small>${position.position_type} · ${formatNumber(totalQty(position))} Qty</small></div><div><b class="${moneyClass(positionPnL(position))}">${signedMoney(positionPnL(position))}</b><small>Avg ${money(position.average_price)} · LTP ${money(position.current_price)}</small></div></div>`).join('')}</div>` : `<div class="compact-empty">No holdings yet. Add a position from Orders.</div>`}<div class="section-heading"><h2>Closed positions</h2><span>${state.closedPositions.length} trades</span></div>${state.closedPositions.length ? `<div class="plain-list">${state.closedPositions.slice(0, 6).map(position => `<div class="holding-row"><div><b>${escapeHtml(position.symbol)}</b><small>${position.position_type} · CLOSED</small></div><b class="${moneyClass(position.realized_pnl)}">${signedMoney(position.realized_pnl)}</b></div>`).join('')}</div>` : `<div class="compact-empty">Exited positions will be recorded here.</div>`}`;
  }
  const reportItems = [
    ['statement', 'Statement (Ledger)', 'Your transactions with Angel One'],
    ['trades', 'Trades and Charges', 'All your charges in one place'],
    ['orders', 'Order History Report', 'All order history in one place'],
    ['pnl', 'Profit and Loss', 'Profit and Loss by trade exit dates for tax reporting'],
    ['insights', 'Trading Insights', 'Analyze trading performance by entry setups'],
    ['funds', 'Fund Transactions', 'History of funds added and withdrawn']
  ];
  function reportIconSvg(kind) {
    const paths = {
      statement: '<path d="M7 3.5h7l5 5V21H7z"/><path d="M14 3.5v5h5M10 12h6M10 15h6"/>',
      trades: '<path d="M12 3.5v17M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6"/>',
      orders: '<rect x="6" y="4" width="12" height="17" rx="1.5"/><path d="M9 3h6v3H9zM9 11h6M9 15h6"/>',
      pnl: '<path d="M4 20V5M4 20h17"/><path d="m7 16 4-5 3 2 5-7"/>',
      insights: '<path d="M4 19.5h16M6 16V9M11 16V5M16 16v-4M21 16V7"/>',
      funds: '<path d="M4 8h15l-3-3M20 16H5l3 3"/><path d="M19 8l-3 3M5 16l3-3"/>',
      download: '<path d="M12 3v11M8 10l4 4 4-4M5 18v3h14v-3"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" class="account-line-icon">${paths[kind] || paths.statement}</svg>`;
  }
  function accountPage() {
    const a = state.account;
    const clientName = a.client_name || 'R.K. Sharma', clientId = a.client_id || 'SIM56797811';
    const reportRows = reportItems.map(([kind, title, sub]) => `<button class="report-menu-row" data-action="open-report" data-kind="${kind}"><span class="report-menu-icon">${reportIconSvg(kind)}</span><span><b>${title}</b><small>${sub}</small></span><span class="profile-chevron">›</span></button>`).join('');
    return `<section class="account-balance"><div class="account-card-title">Your Account</div><div class="balance-content"><div class="balance-label">Trading Balance</div><div class="balance-value-row"><button class="balance-edit-value" data-action="edit-balance" aria-label="Edit trading balance">${money(a.trading_balance)}</button><button class="chevron-button" data-action="edit-balance" aria-label="Edit trading balance">›</button></div><div class="updated-tag"><span aria-hidden="true">◷</span>Last updated at ${timeLabel(a.updated_at)}</div><div class="account-actions"><button class="button button-outline" data-action="withdraw">WITHDRAW</button><button class="button button-primary" data-action="funds">ADD FUNDS</button></div></div></section><div class="account-cards"><button class="feature-card" data-action="pledge-info"><span class="feature-icon teal"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 5.5h13l5 5V26H7zM20 5.5v5h5M11 16h10M11 20h7"/><path d="m20 23 3 3 5-6"/></svg></span><strong>PLEDGE HOLDINGS <span>›</span></strong><p>Pledge stocks or mutual funds you hold to increase trading balance</p></button><button class="feature-card" data-action="mtf-info"><span class="feature-icon violet"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11"/><path d="M16 5v11h11"/><circle cx="13" cy="13" r="1"/><circle cx="19" cy="19" r="1"/></svg></span><strong>MTF <span>›</span></strong><p>View and analyse your MTF stocks</p></button></div><button class="profile-row" data-action="profile-info" aria-label="Edit client name and ID"><span class="profile-avatar"><svg viewBox="0 0 40 48" aria-hidden="true"><circle cx="20" cy="12" r="7"/><path d="M7 42v-5c0-8 5-13 13-13s13 5 13 13v5c-7 4-19 4-26 0Z"/></svg></span><span class="profile-copy"><b>${escapeHtml(clientName)}</b><small>Client ID: ${escapeHtml(clientId)}</small></span><span class="profile-chevron">›</span></button><section class="account-reports"><div class="account-reports-head"><h2>Reports and Statement</h2><p>All your investments and trades in one place</p></div><div class="report-menu-list">${reportRows}<button class="report-menu-row" data-action="download-report"><span class="report-menu-icon">${reportIconSvg('download')}</span><span><b>Download Reports</b><small>Reports in Excel and PDF formats</small></span><span class="profile-chevron">›</span></button></div></section><section class="account-more"><div class="section-heading"><h2>Account snapshot</h2></div><div class="snapshot-row"><span>Available balance</span><b>${money(a.available_balance)}</b></div><div class="snapshot-row"><span>Invested in open positions</span><b>${money(state.totals.invested)}</b></div><div class="snapshot-row"><span>Position value</span><b>${money(state.totals.current)}</b></div><div class="snapshot-row"><span>Unrealized P&amp;L</span><b class="${moneyClass(state.totals.pnl)}">${signedMoney(state.totals.pnl)}</b></div><button class="report-menu-row" data-action="sim-charges"><span class="report-menu-icon">⊖</span><span><b>Charge settings</b><small>Optional fees; default is zero</small></span><span class="profile-chevron">›</span></button><button class="quiet-action" data-action="demo-data" ${state.positions.length ? 'disabled' : ''}>Load reference-style sample positions</button><button class="quiet-action danger-text" data-action="reset">Reset account</button></section>`;
  }
  function reportsPage() {
    return `<div class="page-section-head"><div><span class="screen-kicker">LOCAL DEMO DATA</span><h2>Reports and Statement</h2></div></div><div class="report-menu-list">${reportItems.map(([kind, title, sub]) => `<button class="report-menu-row" data-action="open-report" data-kind="${kind}"><span class="report-menu-icon">${reportIconSvg(kind)}</span><span><b>${title}</b><small>${sub}</small></span><span class="profile-chevron">›</span></button>`).join('')}<button class="report-menu-row" data-action="download-report"><span class="report-menu-icon">${reportIconSvg('download')}</span><span><b>Download Reports</b><small>Reports in Excel and PDF formats</small></span><span class="profile-chevron">›</span></button></div>`;
  }
  function pnlPage() {
    const report = state.report;
    const cards = [['Gross profit', report.grossProfit], ['Gross loss', -report.grossLoss], [' charges', -report.charges], ['Net realized P&L', report.netPnL]];
    return `<div class="page-section-head"><div><span class="screen-kicker">REPORT</span><h2>Profit and Loss</h2></div></div><div class="report-summary-list">${cards.map(([label, value]) => `<div class="snapshot-row"><span>${label}</span><b class="${moneyClass(value)}">${signedMoney(value)}</b></div>`).join('')}<div class="snapshot-row"><span>Unrealized P&amp;L</span><b class="${moneyClass(report.unrealizedPnL)}">${signedMoney(report.unrealizedPnL)}</b></div><div class="snapshot-row"><span>Closed trades</span><b>${report.trades}</b></div></div><p class="report-disclaimer">P&amp;L is calculated from saved  values. It is not a broker statement.</p>`;
  }
  function reportDetailPage() {
    const kind = reportKind;
    const label = reportItems.find(item => item[0] === kind)?.[1] || 'Statement';
    let rows = [];
    if (kind === 'funds') rows = state.funds || [];
    else if (kind === 'orders' || kind === 'trades') rows = state.orders || [];
    else if (kind === 'demat') rows = state.positions || [];
    else rows = state.transactions || [];
    const content = rows.length ? rows.map(item => {
      const title = item.symbol || item.description || item.transaction_type || 'Account record';
      const amount = item.realized_pnl ?? item.amount ?? item.price ?? 0;
      const detail = item.created_at ? timeLabel(item.created_at) : item.status || item.type || '';
      return `<div class="report-record"><div><b>${escapeHtml(title)}</b><small>${escapeHtml(detail)}</small></div><b class="${moneyClass(amount)}">${signedMoney(amount)}</b></div>`;
    }).join('') : `<div class="compact-empty">No ${escapeHtml(label.toLowerCase())} records yet.</div>`;
    return `<div class="page-section-head"><div><span class="screen-kicker">ACCOUNT REPORT</span><h2>${escapeHtml(label)}</h2></div></div><div class="report-menu-list">${content}</div>`;
  }
  function openSheet(title, body, subtitle = '') {
    closeMenu();
    modalRoot.innerHTML = `<div class="sheet-scrim"><section class="native-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="sheet-grabber"></div><div class="sheet-heading"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><button class="sheet-close" data-action="close-sheet" aria-label="Close">×</button></div>${body}</section></div>`;
    document.body.classList.add('sheet-open');
  }
  function closeSheet() {
    modalRoot.innerHTML = '';
    document.body.classList.remove('sheet-open');
  }
  function confirmSheet(title, message, confirmText, callback, danger = false) {
    openSheet(title, `<p class="confirm-copy">${escapeHtml(message)}</p><div class="sheet-actions"><button class="button button-outline" data-action="close-sheet">Cancel</button><button class="button ${danger ? 'button-danger' : 'button-primary'}" id="confirmAction">${escapeHtml(confirmText)}</button></div>`);
    $('#confirmAction').addEventListener('click', async () => {
      $('#confirmAction').disabled = true;
      try { await callback(); closeSheet(); await refresh(); }
      catch (error) { toast(error.message, true); $('#confirmAction').disabled = false; }
    });
  }
  function showMenu(level = 'root') {
    menuOpen = true;
    menuLevel = level;
    const body = level === 'root'
      ? `<div class="menu-section-title">Market Control</div><button class="menu-item" data-action="toggle-market"><span class="menu-symbol ${marketOn ? 'positive' : 'negative'}">${marketOn ? '▶' : 'Ⅱ'}</span><span>Market Status:</span><b class="${marketOn ? 'positive' : 'negative'}">${marketOn ? 'ON' : 'OFF'}</b></button><div class="menu-section-title menu-divider">Manage Positions</div><button class="menu-item" data-action="add-menu"><span class="menu-symbol">＋</span><span>Add New Position</span><b class="menu-arrow">›</b></button><button class="menu-item danger-text" data-action="clear-all"><span class="menu-symbol">▣</span><span>Clear All Entries</span></button>`
      : `<button class="menu-item menu-back" data-action="menu-back"><span>‹</span><b>Manage Positions</b></button><button class="menu-item" data-action="new-position" data-kind="STOCK"><span class="menu-symbol">⌁</span><span>Stock Entry</span></button><button class="menu-item" data-action="new-position" data-kind="OPTION"><span class="menu-symbol">◷</span><span>Option Entry</span></button>`;
    modalRoot.innerHTML = `<div class="menu-scrim"><div class="native-menu" role="menu">${body}</div></div>`;
  }
  function closeMenu() { menuOpen = false; modalRoot.innerHTML = ''; }
  function positionForm(kind = 'STOCK') {
    const option = kind === 'OPTION';
    const demo = option
      ? { symbol: 'NIFTY 27-MAR-26 24500 CE', side: 'BUY', product: 'INTRADAY', mode: 'LOTS', quantity: '1', lotSize: '25', average: '120.50', ltp: '135.20' }
      : { symbol: 'RELIANCE', side: 'BUY', product: 'DELIVERY / CNC', mode: 'QUANTITY', quantity: '1', lotSize: '1', average: '2950.00', ltp: '2955.35' };
    const previewQty = Number(demo.quantity) * (demo.mode === 'LOTS' ? Number(demo.lotSize) : 1);
    const preview = (Number(demo.ltp) - Number(demo.average)) * previewQty * (demo.side === 'SELL' ? -1 : 1);
    return `<form data-form="position" class="entry-form"><input type="hidden" name="entry_kind" value="${kind}"><div class="entry-kind-switch"><span class="${option ? '' : 'selected'}">Stock Entry</span><span class="${option ? 'selected' : ''}">Option Entry</span></div><div class="field-block"><label>Stock / contract name</label><textarea class="contract-name-input" name="symbol" rows="1" maxlength="50" placeholder="${option ? 'NIFTY 27-Mar-26 24500 CE' : 'RELIANCE'}" required>${escapeHtml(demo.symbol)}</textarea></div><div class="entry-grid"><div class="field-block"><label>Transaction</label><select name="position_type"><option ${demo.side === 'BUY' ? 'selected' : ''}>BUY</option><option ${demo.side === 'SELL' ? 'selected' : ''}>SELL</option></select></div><div class="field-block"><label>Product</label><select name="product_type"><option value="INTRADAY" ${demo.product === 'INTRADAY' ? 'selected' : ''}>INTRADAY</option><option value="DELIVERY / CNC" ${demo.product === 'DELIVERY / CNC' ? 'selected' : ''}>DELIVERY</option><option value="CF">CF</option></select></div></div><div class="quantity-mode-block"><span class="quantity-mode-caption">Enter position as</span><div class="quantity-mode-switch" role="radiogroup" aria-label="Choose lots or quantity"><label><input type="radio" name="quantity_mode" value="LOTS" ${demo.mode === 'LOTS' ? 'checked' : ''}><span>Lots</span></label><label><input type="radio" name="quantity_mode" value="QUANTITY" ${demo.mode === 'QUANTITY' ? 'checked' : ''}><span>Quantity</span></label></div></div><div class="entry-grid"><div class="field-block"><label class="quantity-count-label">${demo.mode === 'LOTS' ? 'Lots' : 'Quantity'}</label><input name="quantity" type="number" min="0.01" step="any" value="${demo.quantity}" inputmode="decimal" required></div><div class="field-block lot-size-field ${demo.mode === 'LOTS' ? '' : 'hidden'}"><label>${option ? 'Lot size (units per lot)' : 'Lot size'}</label><input name="lot_size" type="number" min="0.01" step="any" value="${demo.lotSize}" inputmode="decimal" ${demo.mode === 'LOTS' ? '' : 'disabled'} required></div><input ${demo.mode === 'LOTS' ? 'disabled' : ''} class="quantity-mode-lot-reference" name="lot_size" type="hidden" value="${demo.lotSize}"><div class="field-block"><label>Buy / average price (₹)</label><input name="average_price" type="number" min="0" step="any" value="${demo.average}" inputmode="decimal" required></div><div class="field-block"><label>LTP (₹)</label><input name="current_price" type="number" min="0" step="any" value="${demo.ltp}" inputmode="decimal" required></div></div><div class="entry-live-preview" id="entryPreview">Position P&amp;L preview · ${signedMoney(preview)}</div><div class="sheet-actions"><button type="button" class="button button-outline" data-action="close-sheet">Cancel</button><button class="button button-primary">SAVE POSITION</button></div></form>`;
  }
  function showPositionForm(kind = 'STOCK') {
    const option = kind === 'OPTION';
    openSheet(option ? 'Option Entry' : 'Stock Entry', positionForm(kind), option ? 'Sample NIFTY option — all fields are editable.' : 'Sample RELIANCE stock — all fields are editable.');
    fitTextareas(modalRoot);
  }
  function showLtpEditor(position) {
    openSheet('SET LTP', `<form data-form="ltp" data-id="${position.id}"><div class="ltp-set-row"><input name="current_price" type="number" min="0" step="any" inputmode="decimal" value="${position.current_price}" aria-label="Last traded price"><button class="button button-primary" type="button" data-action="ltp-preview">SET</button></div><div class="form-section-title">LTP RANGE</div><div class="entry-grid"><div class="field-block"><label>MIN</label><input name="ltp_min" type="number" min="0" step="any" inputmode="decimal" value="${position.ltp_min ?? ''}" placeholder="Min LTP"></div><div class="field-block"><label>MAX</label><input name="ltp_max" type="number" min="0" step="any" inputmode="decimal" value="${position.ltp_max ?? ''}" placeholder="Max LTP"></div></div><p class="inline-hint">The optional range constrains future  price updates.</p><button class="button button-primary button-wide">SAVE</button></form>`, position.symbol);
  }
  function showChangePercentEditor(position) {
    const value = priceChangePct(position);
    openSheet('Change %', `<form data-form="change-percent" data-id="${position.id}"><div class="change-percent-heading"><span aria-hidden="true">％</span><strong>MANUAL %</strong></div><div class="change-manual-row"><input name="manual_change_pct" class="change-percent-input" type="number" step="any" inputmode="decimal" value="${value.toFixed(2)}" aria-label="Manual price change percentage"><button type="button" class="button button-primary" data-action="save-change-manual" data-id="${position.id}">SAVE</button></div><div class="change-percent-heading change-range-heading"><span aria-hidden="true">☷</span><strong>RANGE (%)</strong></div><div class="entry-grid"><div class="field-block"><label>MIN %</label><input name="change_min_pct" type="number" step="any" inputmode="decimal" value="${position.change_min_pct ?? ''}" placeholder="Min %"></div><div class="field-block"><label>MAX %</label><input name="change_max_pct" type="number" step="any" inputmode="decimal" value="${position.change_max_pct ?? ''}" placeholder="Max %"></div></div><button type="button" class="button button-primary button-wide" data-action="set-change-range" data-id="${position.id}">SET</button><button type="button" class="change-auto-button" data-action="change-percent-auto" data-id="${position.id}">Use automatic %</button></form>`, position.symbol);
    fitTextareas(modalRoot);
  }
  function showPnlEditor(position) {
    const mode = position.pnl_mode || 'AUTO';
    openSheet('P&L Calculation', `<form data-form="pnl" data-id="${position.id}"><div class="mode-options"><label><input type="radio" name="pnl_mode" value="AUTO" ${mode === 'AUTO' ? 'checked' : ''}><span>AUTO</span></label><label><input type="radio" name="pnl_mode" value="MANUAL" ${mode === 'MANUAL' ? 'checked' : ''}><span>MANUAL %</span></label><label><input type="radio" name="pnl_mode" value="RANGE" ${mode === 'RANGE' ? 'checked' : ''}><span>RANGE (%)</span></label></div><div class="pnl-manual-fields ${mode === 'MANUAL' ? '' : 'hidden'}"><div class="field-block"><label>MANUAL %</label><input name="manual_pnl_pct" type="number" step="any" inputmode="decimal" value="${position.manual_pnl_pct ?? ''}" placeholder="e.g. 2.5"></div></div><div class="pnl-range-fields ${mode === 'RANGE' ? '' : 'hidden'}"><div class="entry-grid"><div class="field-block"><label>MIN (%)</label><input name="pnl_min_pct" type="number" step="any" inputmode="decimal" value="${position.pnl_min_pct ?? ''}" placeholder="Min %"></div><div class="field-block"><label>MAX (%)</label><input name="pnl_max_pct" type="number" step="any" inputmode="decimal" value="${position.pnl_max_pct ?? ''}" placeholder="Max %"></div></div><p class="inline-hint">Saving picks a  value within this range. You can re-roll it at any time.</p></div><p class="inline-hint">AUTO follows the LTP. Manual and range modes override P&amp;L only; displayed prices stay unchanged.</p><button class="button button-primary button-wide">SAVE</button></form>`, position.symbol);
  }
  function showFundForm(type) {
    const add = type === 'ADD';
    openSheet(add ? 'ADD FUNDS' : 'WITHDRAW', `<form data-form="fund" data-type="${type}"><p class="form-intro">${add ? 'Add  funds to your paper account.' : 'Withdraw  funds from your paper account.'}</p><div class="field-block"><label>Amount (₹)</label><input name="amount" type="number" min="0.01" step="any" inputmode="decimal" required></div><div class="available-line">Available balance <b>${money(state.account.available_balance)}</b></div><div class="sheet-actions"><button type="button" class="button button-outline" data-action="close-sheet">Cancel</button><button class="button button-primary">${add ? 'ADD FUNDS' : 'WITHDRAW'}</button></div></form>`, 'Demo only · No money moves.');
  }
  function showBalanceForm() {
    openSheet('Trading balance', `<form data-form="balance"><p class="form-intro">Edit the  balance shown in your demo account. This does not move real funds.</p><div class="field-block"><label>Trading balance (₹)</label><input name="trading_balance" type="number" min="0" step="any" inputmode="decimal" value="${state.account.trading_balance}" required></div><button class="button button-primary button-wide">SAVE BALANCE</button></form>`);
  }
  function showProfileForm() {
    const profile = state.account;
    openSheet('Client profile', `<form data-form="profile"><p class="form-intro">Edit the demo client name and ID displayed on your account.</p><div class="field-block"><label>CLIENT NAME</label><input name="client_name" type="text" maxlength="60" value="${escapeHtml(profile.client_name || 'R.K. Sharma')}" required></div><div class="field-block"><label>CLIENT ID</label><input name="client_id" type="text" minlength="3" maxlength="30" value="${escapeHtml(profile.client_id || 'SIM56797811')}" required></div><button class="button button-primary button-wide">SAVE PROFILE</button></form>`, 'Demo profile · Editable details');
  }
  function showWatchForm() {
    openSheet('Add to Watchlist', `<form data-form="watch"><div class="field-block"><label>Stock or index symbol</label><input name="symbol" type="text" maxlength="50" placeholder="RELIANCE" required></div><button class="button button-primary button-wide">ADD SYMBOL</button></form>`);
  }
  function showChargeSettings() {
    API.get('/charges').then(charge => openSheet(' charges', `<form data-form="charges"><p class="form-intro">Optional demo-only accounting charges. All values default to zero.</p><div class="entry-grid">${[['brokerage','Brokerage'],['exchange_charges','Exchange'],['taxes','Taxes'],['other_charges','Other']].map(([key,label]) => `<div class="field-block"><label>${label} (₹)</label><input name="${key}" type="number" min="0" step="0.01" value="${Number(charge[key] || 0)}"></div>`).join('')}</div><button class="button button-primary button-wide">SAVE CHARGES</button></form>`)).catch(error => toast(error.message, true));
  }
  function updateTotalBar() {
    if (!state) return;
    const pnl = state.positions.reduce((sum, position) => sum + positionPnL(position), 0) + (state.closedPositions || []).reduce((sum, position) => sum + Number(position.realized_pnl || 0), 0);
    const bar = $('#positionTotal');
    bar.classList.toggle('total-positive', pnl >= 0);
    bar.classList.toggle('total-negative', pnl < 0);
    bar.innerHTML = `<button class="total-bar-main" data-action="expand-total"><span class="total-check">✓</span><strong>Total</strong><b class="${moneyClass(pnl)}">${signedMoney(pnl)}</b><span class="total-chevron ${totalExpanded ? 'expanded' : ''}">⌃</span></button>${totalExpanded ? `<div class="total-detail"><span>${state.positions.length} open positions</span><span>Invested ${money(state.totals.invested)}</span><span>Unrealized ${signedMoney(pnl)}</span></div>` : ''}`;
  }
  function updatePositionPreview(id) {
    const position = state.positions.find(item => Number(item.id) === Number(id));
    const row = $(`[data-row-id="${id}"]`);
    if (!position || !row) return;
    const pnl = positionPnL(position);
    const pnlButton = row.querySelector('.row-pnl');
    pnlButton.textContent = signedMoney(pnl);
    pnlButton.className = `row-pnl ${moneyClass(pnl)}`;
    const ltp = row.querySelector('.ltp-tap');
    ltp.textContent = `LTP ${money(position.current_price)}`;
    const change = row.querySelector('.change-pct-tap');
    if (change) { change.textContent = `(${priceChangeLabel(position)})`; change.classList.toggle('positive', priceChangePct(position) >= 0); change.classList.toggle('negative', priceChangePct(position) < 0); }
    if (change) change.classList.toggle('range-mode', position.change_pct_mode === 'RANGE');
    updateTotalBar();
  }
  function positionPayload(position) {
    return {
      symbol: String(position.symbol || '').trim().toUpperCase(),
      company_name: String(position.company_name || position.symbol || '').trim(),
      position_type: position.position_type,
      product_type: displayProductType(position.product_type),
      quantity: Number(position.quantity),
      quantity_mode: String(position.quantity_mode || 'LOTS').toUpperCase(),
      lot_size: Number(position.lot_size),
      average_price: Number(position.average_price),
      current_price: Number(position.current_price)
    };
  }
  async function savePosition(position) {
    try {
      await API.put(`/positions/${position.id}`, positionPayload(position));
      await refresh({ quiet: true });
      toast('Position saved.');
    } catch (error) {
      toast(error.message, true);
      await refresh({ quiet: true });
    }
  }
  async function submitForm(form) {
    const data = Object.fromEntries(new FormData(form));
    if (form.dataset.form === 'position') {
      const payload = { symbol: String(data.symbol).trim().toUpperCase(), company_name: String(data.symbol).trim(), position_type: data.position_type, product_type: data.product_type, quantity: Number(data.quantity), quantity_mode: data.quantity_mode || 'LOTS', lot_size: Number(data.lot_size), average_price: Number(data.average_price), current_price: Number(data.current_price) };
      await API.post('/positions', payload);
      closeSheet(); await refresh({ quiet: true }); toast('Position added.');
    } else if (form.dataset.form === 'ltp') {
      const position = state.positions.find(item => Number(item.id) === Number(form.dataset.id));
      await API.put(`/positions/${form.dataset.id}/settings`, { current_price: Number(data.current_price), ltp_min: data.ltp_min || null, ltp_max: data.ltp_max || null, pnl_mode: position.pnl_mode || 'AUTO', manual_pnl_pct: position.manual_pnl_pct, pnl_min_pct: position.pnl_min_pct, pnl_max_pct: position.pnl_max_pct });
      closeSheet(); await refresh({ quiet: true }); toast('LTP and range saved.');
    } else if (form.dataset.form === 'pnl') {
      const mode = data.pnl_mode || 'AUTO';
      const minimum = data.pnl_min_pct === '' ? null : Number(data.pnl_min_pct);
      const maximum = data.pnl_max_pct === '' ? null : Number(data.pnl_max_pct);
      let manual = data.manual_pnl_pct === '' ? null : Number(data.manual_pnl_pct);
      if (mode === 'RANGE') {
        if (minimum === null || maximum === null || minimum > maximum) throw new Error('Enter a valid P&L range.');
        manual = Math.round((minimum + Math.random() * (maximum - minimum) + Number.EPSILON) * 100) / 100;
      }
      const position = state.positions.find(item => Number(item.id) === Number(form.dataset.id));
      await API.put(`/positions/${form.dataset.id}/settings`, { current_price: position.current_price, ltp_min: position.ltp_min, ltp_max: position.ltp_max, pnl_mode: mode, manual_pnl_pct: manual, pnl_min_pct: mode === 'RANGE' ? minimum : null, pnl_max_pct: mode === 'RANGE' ? maximum : null });
      closeSheet(); await refresh({ quiet: true }); toast(mode === 'RANGE' ? ` P&L set to ${manual.toFixed(2)}%.` : 'P&L calculation saved.');
    } else if (form.dataset.form === 'fund') {
      await API.post(form.dataset.type === 'ADD' ? '/account/funds' : '/account/withdraw', { amount: Number(data.amount) });
      closeSheet(); await refresh({ quiet: true }); toast(form.dataset.type === 'ADD' ? ' funds added.' : ' withdrawal recorded.');
    } else if (form.dataset.form === 'balance') {
      await API.put('/account', { trading_balance: Number(data.trading_balance) });
      closeSheet(); await refresh({ quiet: true }); toast('Trading balance updated.');
    } else if (form.dataset.form === 'profile') {
      await API.put('/account/profile', { client_name: String(data.client_name).trim(), client_id: String(data.client_id).trim() });
      closeSheet(); await refresh({ quiet: true }); toast('Client profile updated.');
    } else if (form.dataset.form === 'watch') {
      await API.post('/watchlist', { symbol: data.symbol });
      closeSheet(); await refresh({ quiet: true }); toast('Added to watchlist.');
    } else if (form.dataset.form === 'charges') {
      for (const key of ['brokerage', 'exchange_charges', 'taxes', 'other_charges']) data[key] = Number(data[key]);
      await API.put('/charges', data);
      closeSheet(); await refresh({ quiet: true }); toast(' charges saved.');
    }
  }
  function downloadCSV() {
    const rows = [['Type', 'Symbol', 'Amount', 'Description', 'Date'], ...(state.transactions || []).map(item => [item.type, item.symbol || '', item.amount, item.description, item.created_at])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'trading-statement.csv'; link.click(); URL.revokeObjectURL(link.href);
    toast('Report downloaded.');
  }
  async function saveChangePercent(action, element) {
    const form = element.closest('form[data-form="change-percent"]');
    const id = Number(element.dataset.id || form?.dataset.id);
    let payload, message;
    if (action === 'save-change-manual') {
      const raw = form?.elements.manual_change_pct.value.trim();
      if (!raw || !Number.isFinite(Number(raw))) throw new Error('Enter a valid manual percentage.');
      payload = { change_pct_mode: 'MANUAL', manual_change_pct: Number(raw) };
      message = `Displayed change set to ${Number(raw) > 0 ? '+' : ''}${Number(raw).toFixed(2)}%.`;
    } else if (action === 'set-change-range') {
      const minRaw = form?.elements.change_min_pct.value.trim(), maxRaw = form?.elements.change_max_pct.value.trim();
      const minimum = Number(minRaw), maximum = Number(maxRaw);
      if (!minRaw || !maxRaw || !Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) throw new Error('Enter a valid percentage range.');
      payload = { change_pct_mode: 'RANGE', change_min_pct: minimum, change_max_pct: maximum };
      const saved = await API.put(`/positions/${id}/change-percent`, payload);
      closeSheet(); await refresh({ quiet: true });
      message = `Displayed change set to ${Number(saved.manual_change_pct) > 0 ? '+' : ''}${Number(saved.manual_change_pct).toFixed(2)}%.`;
      toast(message); return;
    } else {
      payload = { change_pct_mode: 'AUTO' };
      message = 'Automatic price change restored.';
    }
    await API.put(`/positions/${id}/change-percent`, payload);
    closeSheet(); await refresh({ quiet: true }); toast(message);
  }
  async function handleAction(action, element) {
    const id = Number(element?.dataset.id);
    const position = state?.positions?.find(item => Number(item.id) === id);
    switch (action) {
      case 'refresh': return refresh();
      case 'toggle-search': searchOpen = !searchOpen; if (!searchOpen) searchInput.value = ''; renderHeader(); if (searchOpen) searchInput.focus(); return renderScreenOnly();
      case 'toggle-filter': filterOpen = !filterOpen; return render();
      case 'filter-choice': filterValue = element.dataset.filter || 'ALL'; filterOpen = true; return render();
      case 'menu-toggle': return menuOpen ? closeMenu() : showMenu();
      case 'close-menu': closeMenu(); return;
      case 'menu-back': return showMenu('root');
      case 'add-menu': return showMenu('add');
      case 'new-position-menu': return showMenu('add');
      case 'new-position': return showPositionForm(element.dataset.kind || 'STOCK');
      case 'close-sheet': if (element?.closest('.sheet-scrim') && element !== element.closest('.sheet-scrim')) return; return closeSheet();
      case 'edit-ltp': if (position) return showLtpEditor(position); return;
      case 'edit-pnl': if (position) return showPnlEditor(position); return;
      case 'edit-change-percent': if (position) return showChangePercentEditor(position); return;
      case 'save-change-manual':
      case 'set-change-range':
      case 'change-percent-auto': return saveChangePercent(action, element);
      case 'toggle-quantity-mode': if (position) { const units = totalQty(position); position.quantity_mode = position.quantity_mode === 'QUANTITY' ? 'LOTS' : 'QUANTITY'; position.quantity = position.quantity_mode === 'QUANTITY' ? units : units / (Number(position.lot_size) || 1); await savePosition(position); } return;
      case 'ltp-preview': { const form = element.closest('form'); const out = form.querySelector('.ltp-preview-output'); if (out) out.textContent = `Preview: ${money(form.elements.current_price.value)}`; return; }
      case 'expand-total': totalExpanded = !totalExpanded; return updateTotalBar();
      case 'toggle-side': if (position) { position.position_type = position.position_type === 'BUY' ? 'SELL' : 'BUY'; const wrapper = $(`[data-wrap-id="${id}"]`); if (wrapper) wrapper.outerHTML = positionRow(position); updateTotalBar(); await savePosition(position); } return;
      case 'exit-position': if (position) return confirmSheet('EXIT AT MARKET', `Close ${position.symbol} at its saved  LTP (${money(position.current_price)})?`, 'CONFIRM EXIT', async () => { await API.post(`/positions/${id}/exit`, {}); }, true); return;
      case 'delete-position': if (position) return confirmSheet('Delete Entry', `Delete ${position.symbol} and its linked  entry record?`, 'DELETE ENTRY', async () => { await API.delete(`/positions/${id}`); }, true); return;
      case 'exit-all':
      case 'secure-exit': if (!state.positions.length) return toast('There are no open positions.'); return confirmSheet(action === 'secure-exit' ? 'SECURE EXIT' : 'EXIT ALL', `Close all ${state.positions.length} open positions at their saved  LTP?`, 'EXIT ALL POSITIONS', async () => { await API.post('/positions/exit-all', {}); }, true);
      case 'clear-all': return confirmSheet('Clear All Entries', 'Remove all open position rows and their linked  entry records? Account balance and watchlist will stay unchanged.', 'CLEAR ENTRIES', async () => { await API.delete('/positions'); }, true);
      case 'toggle-market': marketOn = !marketOn; localStorage.setItem('simulator-market-on', String(marketOn)); renderHeader(); showMenu('root'); toast(marketOn ? ' market movement turned on.' : ' market movement stopped.'); syncMarketTimer(); return;
      case 'add-watch': return showWatchForm();
      case 'quick-watch': await API.post('/watchlist', { symbol: element.dataset.symbol }); await refresh({ quiet: true }); return toast('Added to watchlist.');
      case 'remove-watch': await API.delete(`/watchlist/${id}`); await refresh({ quiet: true }); return toast('Removed from watchlist.');
      case 'funds': return showFundForm('ADD');
      case 'withdraw': return showFundForm('WITHDRAW');
      case 'edit-balance': return showBalanceForm();
      case 'pledge-info': return openSheet('PLEDGE HOLDINGS', '<p class="form-intro">Pledge is a visual demo feature only. This prototype does not connect to a depository or change any real holdings.</p><button class="button button-primary button-wide" data-action="close-sheet">GOT IT</button>');
      case 'mtf-info': return openSheet('MTF', '<p class="form-intro">Margin Trade Funding is shown for prototype completeness only. No lending, interest, or real orders are involved.</p><button class="button button-primary button-wide" data-action="close-sheet">GOT IT</button>');
      case 'profile-info': return showProfileForm();
      case 'sim-charges': return showChargeSettings();
      case 'open-report':
        reportKind = element.dataset.kind || 'statement';
        if (reportKind === 'pnl') return openScreen('pnl');
        history.pushState({ screen: 'reportDetail', kind: reportKind }, '', `#report-${reportKind}`);
        currentScreen = 'reportDetail'; render(); return;
      case 'download-report': return downloadCSV();
      case 'demo-data': await API.post('/demo-data', {}); await refresh({ quiet: true }); return toast('Reference-style sample positions loaded.');
      case 'reset': return confirmSheet('Reset account', 'Clear all  positions, orders, transactions, and watchlist items? The balance will return to ₹1,00,000.', 'RESET ACCOUNT', async () => { await API.post('/reset', {}); }, true);
      case 'price-nudge': await API.post('/simulate-price', { percent: Number(element.dataset.percent) }); await refresh({ quiet: true }); return;
      default: return;
    }
  }
  function renderScreenOnly() {
    if (!state) return;
    document.body.classList.toggle('account-active', currentScreen === 'account');
    const pages = { home: homePage, watchlist: watchlistPage, portfolio: portfolioPage, orders: ordersPage, account: accountPage, reports: reportsPage, reportDetail: reportDetailPage, pnl: pnlPage };
    screen.innerHTML = (pages[currentScreen] || ordersPage)();
    fitTextareas(screen);
    const showTotal = currentScreen === 'orders' && orderView === 'positions';
    $('#positionTotal').classList.toggle('hidden', !showTotal);
    document.body.classList.toggle('positions-active', showTotal);
    if (showTotal) updateTotalBar();
  }
  function syncMarketTimer() {
    clearInterval(marketTimer);
    marketTimer = null;
    if (!marketOn || document.hidden) return;
    marketTimer = setInterval(async () => {
      if (!state?.positions?.length) return;
      const move = (Math.random() < 0.5 ? -1 : 1) * (0.04 + Math.random() * 0.16);
      try { await API.post('/simulate-price', { percent: Number(move.toFixed(3)) }); await refresh({ quiet: true }); } catch (_) { /* keep the demo available when a background tick fails */ }
    }, 8000);
  }
  function updateLiveValues(id) {
    const position = state.positions.find(item => Number(item.id) === Number(id));
    if (!position) return;
    position.company_name = position.symbol;
    updatePositionPreview(id);
    const nameField = $(`[data-position-field="symbol"][data-id="${id}"]`);
    if (nameField && document.activeElement !== nameField) {
      if (nameField.isContentEditable) nameField.innerHTML = contractNameContents(position);
      else nameField.value = position.symbol;
    }
  }
  async function onPositionFieldInput(event) {
    const field = event.target.closest('[data-position-field]');
    if (!field || field.tagName === 'SELECT') return;
    const position = state.positions.find(item => Number(item.id) === Number(field.dataset.id));
    if (!position) return;
    const key = field.dataset.positionField;
    const fieldValue = field.isContentEditable ? String(field.innerText || field.textContent || '').replace(/\s+/g, ' ').trim() : field.value;
    position[key] = field.type === 'number' ? Number(field.value || 0) : fieldValue;
    if (key === 'symbol') position.company_name = fieldValue;
    updateLiveValues(field.dataset.id);
  }
  async function commitPositionField(event) {
    const field = event.target.closest('[data-position-field]');
    if (!field || field.type === 'select-one') return;
    const position = state.positions.find(item => Number(item.id) === Number(field.dataset.id));
    if (!position) return;
    if (!position.symbol.trim() || Number(position.quantity) <= 0 || Number(position.lot_size) <= 0 || Number(position.average_price) < 0) {
      toast('Enter a name, positive lots or quantity, and valid average price.', true); await refresh({ quiet: true }); return;
    }
    await savePosition(position);
  }
  async function onSelectField(event) {
    const field = event.target.closest('select[data-position-field]');
    if (!field) return;
    const position = state.positions.find(item => Number(item.id) === Number(field.dataset.id));
    if (!position) return;
    const key = field.dataset.positionField;
    if (key === 'quantity_mode') {
      const units = totalQty(position);
      position.quantity_mode = field.value;
      position.quantity = field.value === 'QUANTITY' ? units : units / (Number(position.lot_size) || 1);
      const wrap = $(`[data-wrap-id="${position.id}"]`); if (wrap) wrap.outerHTML = positionRow(position);
    } else position[key] = field.value;
    await savePosition(position);
  }
  function handleModeChange(event) {
    const radio = event.target.closest('input[name="pnl_mode"]');
    if (!radio) return;
    $('.pnl-manual-fields', modalRoot)?.classList.toggle('hidden', radio.value !== 'MANUAL');
    $('.pnl-range-fields', modalRoot)?.classList.toggle('hidden', radio.value !== 'RANGE');
  }
  function handleQuantityModeChange(event) {
    const radio = event.target.closest('input[name="quantity_mode"]');
    if (!radio) return;
    const form = radio.closest('form');
    const lots = radio.value === 'LOTS';
    const label = $('.quantity-count-label', form); if (label) label.textContent = lots ? 'Lots' : 'Quantity';
    $('.lot-size-field', form)?.classList.toggle('hidden', !lots);
    const visibleLotInput = $('.lot-size-field input[name="lot_size"]', form); if (visibleLotInput) visibleLotInput.disabled = !lots;
    const lotInput = $('.quantity-mode-lot-reference', form); if (lotInput) lotInput.disabled = lots;
    handleFormPreview(event);
  }
  function handleFormPreview(event) {
    const form = event.target.closest('form[data-form="position"]');
    if (!form) return;
    const data = Object.fromEntries(new FormData(form));
    const quantity = Number(data.quantity || 0), lot = Number(data.lot_size || 1);
    const totalQuantity = data.quantity_mode === 'QUANTITY' ? quantity : quantity * lot;
    const avg = Number(data.average_price || 0), ltp = Number(data.current_price || 0);
    const sign = data.position_type === 'SELL' ? -1 : 1;
    const value = (ltp - avg) * totalQuantity * sign;
    const output = $('#entryPreview', form);
    if (output) output.textContent = `Position P&L preview · ${signedMoney(value)}`;
  }
  let touchStart = null;
  screen.addEventListener('touchstart', event => { const row = event.target.closest('.position-row'); if (row) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, row }; }, { passive: true });
  screen.addEventListener('touchend', event => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) touchStart.row.classList.toggle('revealed', dx < 0);
    else if (Math.abs(dx) < 8) screen.querySelectorAll('.position-row.revealed').forEach(row => row !== touchStart.row && row.classList.remove('revealed'));
    touchStart = null;
  }, { passive: true });
  screen.addEventListener('keydown', event => { if (event.target.closest('.inline-contract-name') && event.key === 'Enter') event.preventDefault(); });
  screen.addEventListener('input', event => { fitTextarea(event.target.closest('textarea')); onPositionFieldInput(event); handleFormPreview(event); });
  screen.addEventListener('focusout', event => { commitPositionField(event); });
  screen.addEventListener('change', event => { onSelectField(event); handleModeChange(event); });
  screen.addEventListener('click', async event => {
    const control = event.target.closest('[data-screen]');
    if (control) { openScreen(control.dataset.screen); return; }
    const view = event.target.closest('[data-order-view]');
    if (view) { orderView = view.dataset.orderView; render(); return; }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.classList.contains('sheet-scrim') && event.target === action) { closeSheet(); return; }
    if (action.classList.contains('menu-scrim') && event.target === action) { closeMenu(); return; }
    try { await handleAction(action.dataset.action, action); }
    catch (error) { toast(error.message || 'Action could not be completed.', true); }
  });
  modalRoot.addEventListener('click', async event => {
    const sheetBackdrop = event.target.closest('.sheet-scrim');
    const menuBackdrop = event.target.closest('.menu-scrim');
    if (sheetBackdrop && event.target === sheetBackdrop) { closeSheet(); return; }
    if (menuBackdrop && event.target === menuBackdrop) { closeMenu(); return; }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'close-sheet') { closeSheet(); return; }
    if (action.dataset.action === 'ltp-preview') {
      const form = action.closest('form');
      let output = form.querySelector('.ltp-preview-output');
      if (!output) { output = document.createElement('p'); output.className = 'ltp-preview-output'; action.parentElement.after(output); }
      output.textContent = `Preview LTP: ${money(form.elements.current_price.value)}`;
      return;
    }
    try { await handleAction(action.dataset.action, action); }
    catch (error) { toast(error.message || 'Action could not be completed.', true); }
  });
  modalRoot.addEventListener('input', event => { fitTextarea(event.target.closest('textarea')); handleFormPreview(event); });
  modalRoot.addEventListener('change', event => { handleModeChange(event); handleQuantityModeChange(event); });
  $('#mobileNav').addEventListener('click', event => {
    const button = event.target.closest('[data-screen]');
    if (button) openScreen(button.dataset.screen);
  });
  $('#positionTotal').addEventListener('click', event => {
    if (event.target.closest('[data-action="expand-total"]')) { totalExpanded = !totalExpanded; updateTotalBar(); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"],button:not([type])');
    if (button) button.disabled = true;
    try { await submitForm(form); }
    catch (error) { toast(error.message, true); if (button) button.disabled = false; }
  });
  $('#searchButton').addEventListener('click', () => handleAction('toggle-search'));
  $('#filterButton').addEventListener('click', () => handleAction('toggle-filter'));
  $('#overflowButton').addEventListener('click', () => handleAction('menu-toggle'));
  $('#refreshButton').addEventListener('click', () => refresh());
  searchInput.addEventListener('input', () => renderScreenOnly());
  window.addEventListener('popstate', event => {
    if (modalRoot.innerHTML) { closeSheet(); closeMenu(); return; }
    const next = event.state?.screen;
    if (next) { currentScreen = next; if (event.state?.kind) reportKind = event.state.kind; render(); }
    else { currentScreen = 'orders'; render(); }
  });
  document.addEventListener('visibilitychange', syncMarketTimer);
  $('#orderSwitch').addEventListener('click', event => {
    const button = event.target.closest('[data-order-view]');
    if (button) { orderView = button.dataset.orderView; render(); }
  });
  history.replaceState({ screen: 'orders' }, '', '#orders');
  refresh();
})();
