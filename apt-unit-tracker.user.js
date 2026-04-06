// ==UserScript==
// @name         Apartment Unit Tracker
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Pick specific units to track from apartments.com
// @author       skyline
// @match        https://www.apartments.com/*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        apiUrl:     'https://apt-tracker.pages.dev/api',
        trackerUrl: 'https://apt-tracker.pages.dev/',
    };

    function getBuildingInfo() {
        const name    = document.querySelector('h1.propertyName')?.innerText?.trim() || 'N/A';
        const street  = document.querySelector('.delivery-address span')?.innerText?.trim() || '';
        const city    = document.querySelector('.propertyAddressRow h2 span:nth-child(2)')?.innerText?.trim() || '';
        const state   = document.querySelector('.stateZipContainer span:first-child')?.innerText?.trim() || '';
        const zip     = document.querySelector('.stateZipContainer span:last-child')?.innerText?.trim() || '';
        const phone   = document.querySelector('.propertyPhone span.phoneNumber')?.innerText?.trim() || 'N/A';
        const walkScore    = document.querySelector('.score-card.walk .score-number')?.innerText?.trim() || 'N/A';
        const transitScore = document.querySelector('.score-card.transit .score-number')?.innerText?.trim() || 'N/A';
        const bikeScore    = document.querySelector('.score-card.bike .score-number')?.innerText?.trim() || 'N/A';
        const amenities    = [...document.querySelectorAll('.amenityLabel')].map(el => el.innerText.trim()).filter(Boolean).join(', ') || 'N/A';
        const parking      = [...document.querySelectorAll('.feeName')]
                                .filter(el => el.innerText.includes('Parking'))
                                .map(el => el.closest('.component-row')?.querySelector('.feeValue')?.innerText?.trim())
                                .filter(Boolean).join(' / ') || 'N/A';
        return { name, address: [street, city, state, zip].filter(Boolean).join(', '), phone, walkScore, transitScore, bikeScore, amenities, parking };
    }

    function getAvailableUnits() {
        const units = [];
        const seenKeys = new Set();

        document.querySelectorAll('li.unitContainer').forEach(li => {
            const unitKey = li.dataset.unitkey;
            if (!unitKey || seenKeys.has(unitKey)) return;
            seenKeys.add(unitKey);
            const price = li.querySelector('.pricingColumn span:not(.screenReaderOnly)')?.innerText?.trim() || 'N/A';
            const sqft  = li.querySelector('.sqftColumn span:not(.screenReaderOnly)')?.innerText?.trim() || 'N/A';
            const avail = li.querySelector('.dateAvailable span:not(.screenReaderOnly)')?.innerText?.trim() || 'N/A';
            units.push({
                unitKey,
                unitNum: li.dataset.unit,
                model:   li.dataset.model,
                beds:    li.dataset.beds,
                baths:   li.dataset.baths,
                price, sqft, avail
            });
        });

        if (units.length === 0) {
            document.querySelectorAll('[data-tab-content-id="all"] .pricingGridItem .priceGridModelWrapper').forEach(fp => {
                const key = fp.dataset.rentalkey;
                if (!key || seenKeys.has(key)) return;
                seenKeys.add(key);
                const model = fp.querySelector('.modelName')?.innerText?.trim() || 'N/A';
                const price = fp.querySelector('.rentLabel')?.childNodes[0]?.textContent?.trim() || 'N/A';
                const spans = [...fp.querySelectorAll('.detailsTextWrapper span')];
                units.push({
                    unitKey: 'fp-' + key, unitNum: '—', model,
                    beds: spans[0]?.innerText?.trim() || 'N/A',
                    baths: spans[1]?.innerText?.trim() || 'N/A',
                    sqft: spans[2]?.innerText?.trim() || 'N/A',
                    price,
                    avail: fp.querySelector('.availabilityInfo, .availability')?.innerText?.trim() || 'Check listing'
                });
            });
        }
        return units;
    }

    function getSaved() { return JSON.parse(localStorage.getItem('apt_units') || '[]'); }
    function saveUnits(entries) {
        const saved = getSaved();
        entries.forEach(e => saved.push(e));
        localStorage.setItem('apt_units', JSON.stringify(saved));
    }

    function showPicker() {
        const allUnits = getAvailableUnits();
        const building = getBuildingInfo();

        // Unique bed/bath options
        const bedOpts  = ['All', ...[...new Set(allUnits.map(u => u.beds))].filter(Boolean).sort((a,b) => parseFloat(a)-parseFloat(b))];
        const bathOpts = ['All', ...[...new Set(allUnits.map(u => u.baths))].filter(Boolean).sort((a,b) => parseFloat(a)-parseFloat(b))];

        const overlay = document.createElement('div');
        overlay.id = 'apt-picker-overlay';
        overlay.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,.75);
            z-index:999999;display:flex;align-items:center;justify-content:center;
            font-family:'Segoe UI',sans-serif;
        `;

        overlay.innerHTML = `
        <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:14px;
            width:680px;max-height:85vh;display:flex;flex-direction:column;
            overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.7);">

            <!-- Header -->
            <div style="padding:16px 20px;border-bottom:1px solid #2a2a4a;
                display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <div>
                    <div style="font-size:17px;font-weight:700;color:#7eb8f7;">🏠 ${building.name}</div>
                    <div style="font-size:12px;color:#888;margin-top:3px;">${building.address}</div>
                </div>
                <button id="apt-close-picker" style="background:#e74c3c;color:#fff;border:none;
                    border-radius:6px;padding:6px 14px;cursor:pointer;font-size:13px;font-weight:600;">
                    ✕ Close
                </button>
            </div>

            <!-- Filter + toolbar row -->
            <div style="padding:10px 16px;border-bottom:1px solid #2a2a4a;display:flex;
                align-items:center;gap:8px;flex-wrap:wrap;flex-shrink:0;background:#13132a;">

                <!-- Bed filter pills -->
                <span style="font-size:11px;color:#888;white-space:nowrap;">Beds:</span>
                <div id="apt-bed-pills" style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${bedOpts.map((b,i) => `
                        <button data-bed="${b}" onclick="filterPicker()" style="
                            padding:3px 10px;border-radius:12px;border:1px solid #2a2a4a;
                            background:${i===0?'#7eb8f7':'#1e1e3a'};
                            color:${i===0?'#000':'#aaa'};
                            cursor:pointer;font-size:12px;font-weight:600;
                            transition:all .15s;" class="apt-bed-pill">
                            ${b === 'All' ? 'All' : b+'bd'}
                        </button>`).join('')}
                </div>

                <span style="font-size:11px;color:#888;white-space:nowrap;margin-left:6px;">Baths:</span>
                <div id="apt-bath-pills" style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${bathOpts.map((b,i) => `
                        <button data-bath="${b}" onclick="filterPicker()" style="
                            padding:3px 10px;border-radius:12px;border:1px solid #2a2a4a;
                            background:${i===0?'#7eb8f7':'#1e1e3a'};
                            color:${i===0?'#000':'#aaa'};
                            cursor:pointer;font-size:12px;font-weight:600;
                            transition:all .15s;" class="apt-bath-pill">
                            ${b === 'All' ? 'All' : b+'ba'}
                        </button>`).join('')}
                </div>

                <!-- Select / deselect -->
                <div style="margin-left:auto;display:flex;gap:6px;align-items:center;">
                    <button id="apt-sel-all" style="background:#2a2a4a;color:#ccc;border:none;
                        border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">✅ All</button>
                    <button id="apt-desel-all" style="background:#2a2a4a;color:#ccc;border:none;
                        border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">☐ None</button>
                    <span id="apt-pick-count" style="font-size:12px;color:#7eb8f7;min-width:70px;text-align:right;"></span>
                </div>
            </div>

            <!-- Unit list -->
            <div style="overflow-y:auto;flex:1;" id="apt-unit-list"></div>

            <!-- Footer -->
            <div style="padding:14px 20px;border-top:1px solid #2a2a4a;
                display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <span id="apt-visible-count" style="font-size:12px;color:#888;"></span>
                <button id="apt-do-save" style="background:#27ae60;color:#fff;border:none;
                    border-radius:8px;padding:10px 28px;cursor:pointer;font-size:14px;font-weight:700;">
                    💾 Save Selected
                </button>
            </div>
        </div>`;

        document.body.appendChild(overlay);

        window._pickerUnits = allUnits;

        window.filterPicker = function() {
            // Update pill active states
            const bedPill  = document.querySelector('.apt-bed-pill[style*="background:#7eb8f7"]')?.dataset.bed || 'All';
            const bathPill = document.querySelector('.apt-bath-pill[style*="background:#7eb8f7"]')?.dataset.bath || 'All';

            // Determine which pill was just clicked by checking the event
            // We re-read active from data
            const activeBed  = [...document.querySelectorAll('.apt-bed-pill')].find(b => b.style.background.includes('7eb8f7'))?.dataset.bed || 'All';
            const activeBath = [...document.querySelectorAll('.apt-bath-pill')].find(b => b.style.background.includes('7eb8f7'))?.dataset.bath || 'All';

            renderList(activeBed, activeBath);
        };

        overlay.querySelectorAll('.apt-bed-pill').forEach(btn => {
            btn.onclick = function() {
                overlay.querySelectorAll('.apt-bed-pill').forEach(b => {
                    b.style.background = '#1e1e3a'; b.style.color = '#aaa';
                });
                this.style.background = '#7eb8f7'; this.style.color = '#000';
                const activeBath = [...overlay.querySelectorAll('.apt-bath-pill')].find(b => b.style.background.includes('7eb8f7'))?.dataset.bath || 'All';
                renderList(this.dataset.bed, activeBath);
            };
        });

        overlay.querySelectorAll('.apt-bath-pill').forEach(btn => {
            btn.onclick = function() {
                overlay.querySelectorAll('.apt-bath-pill').forEach(b => {
                    b.style.background = '#1e1e3a'; b.style.color = '#aaa';
                });
                this.style.background = '#7eb8f7'; this.style.color = '#000';
                const activeBed = [...overlay.querySelectorAll('.apt-bed-pill')].find(b => b.style.background.includes('7eb8f7'))?.dataset.bed || 'All';
                renderList(activeBed, this.dataset.bath);
            };
        });

        function renderList(bedF, bathF) {
            const filtered = allUnits.filter(u => {
                const bMatch  = !bedF  || bedF  === 'All' || u.beds  === bedF;
                const baMatch = !bathF || bathF === 'All' || u.baths === bathF;
                return bMatch && baMatch;
            });

            const html = filtered.length ? filtered.map((u, i) => `
                <label data-unit-idx="${allUnits.indexOf(u)}" style="display:flex;align-items:flex-start;
                    gap:12px;padding:11px 16px;border-bottom:1px solid #1e1e3a;cursor:pointer;"
                    onmouseover="this.style.background='#1e2a45'"
                    onmouseout="this.style.background='transparent'">
                    <input type="checkbox" data-idx="${allUnits.indexOf(u)}"
                        style="margin-top:4px;width:16px;height:16px;accent-color:#7eb8f7;flex-shrink:0;">
                    <div>
                        <div style="font-weight:700;color:#e0e0e0;font-size:14px;">
                            Unit ${u.unitNum !== '—' ? u.unitNum : u.model}
                            <span style="color:#7eb8f7;margin-left:8px;">${u.price}</span>
                            ${u.avail.toLowerCase().includes('now')
                                ? '<span style="color:#27ae60;font-size:11px;margin-left:6px;font-weight:700;">● NOW</span>'
                                : u.avail !== 'N/A' ? '<span style="color:#f0c030;font-size:11px;margin-left:6px;">● '+u.avail+'</span>' : ''}
                        </div>
                        <div style="font-size:12px;color:#888;margin-top:3px;display:flex;gap:14px;flex-wrap:wrap;">
                            ${u.unitNum !== '—' ? `<span>📋 ${u.model}</span>` : ''}
                            <span>🛏 ${u.beds}bd / ${u.baths}ba</span>
                            <span>📐 ${u.sqft} sqft</span>
                        </div>
                    </div>
                </label>
            `).join('') : `<div style="padding:40px;text-align:center;color:#555;font-size:14px;">
                No units match this filter.
            </div>`;

            document.getElementById('apt-unit-list').innerHTML = html;
            document.getElementById('apt-visible-count').textContent =
                filtered.length + ' unit' + (filtered.length !== 1 ? 's' : '') + ' shown';

            // Reattach checkbox listeners
            overlay.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = updateCount);
            updateCount();
        }

        function updateCount() {
            const n = overlay.querySelectorAll('input[type=checkbox]:checked').length;
            document.getElementById('apt-pick-count').textContent = n ? n + ' selected' : '';
        }

        // Initial render
        renderList('All', 'All');

        // Select/deselect all visible
        document.getElementById('apt-sel-all').onclick = () => {
            overlay.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
            updateCount();
        };
        document.getElementById('apt-desel-all').onclick = () => {
            overlay.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
            updateCount();
        };

        document.getElementById('apt-close-picker').onclick = () => overlay.remove();
        overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

        // Save
        document.getElementById('apt-do-save').onclick = () => {
            const checked = [...overlay.querySelectorAll('input[type=checkbox]:checked')];
            if (!checked.length) { alert('Select at least one unit!'); return; }

            const entries = checked.map(cb => {
                const u = allUnits[parseInt(cb.dataset.idx)];
                return {
                    Building:        building.name,
                    Address:         building.address,
                    Phone:           building.phone,
                    Unit:            u.unitNum,
                    "Floor Plan":    u.model,
                    Beds:            u.beds,
                    Baths:           u.baths,
                    Price:           u.price,
                    "Sq Ft":         u.sqft,
                    Availability:    u.avail,
                    Amenities:       building.amenities,
                    Parking:         building.parking,
                    "Walk Score":    building.walkScore,
                    "Transit Score": building.transitScore,
                    "Bike Score":    building.bikeScore,
                    _url:            window.location.href,
                    "Saved On":      new Date().toLocaleDateString(),
                    _notes:          '',
                    _reactions:      [],
                    _savedAt:        Date.now() + Math.random()
                };

            });

            saveUnits(entries);
            document.getElementById('apt-count').textContent = getSaved().length;

            // Ask to sync immediately
            if (confirm('Units saved! Sync to cloud now?')) {
                let pass = localStorage.getItem('apt_tracker_passcode');
                if (!pass) {
                    pass = prompt('Enter passcode:');
                    if (pass) localStorage.setItem('apt_tracker_passcode', pass);
                }
                if (pass) {
                    fetch(CONFIG.apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Passcode': pass },
                        body: JSON.stringify(entries)
                    }).then(r => r.json()).then(d => {
                        if (d.ok) alert('Synced to cloud!');
                        else alert('Sync failed: ' + (d.error || 'Unknown error'));
                    }).catch(e => alert('Sync error'));
                }
            }

            const btn = document.getElementById('apt-save-btn');
            btn.textContent = `✅ ${checked.length} unit(s) saved!`;
            btn.style.background = '#27ae60'; btn.style.borderColor = '#27ae60';
            setTimeout(() => {
                btn.textContent = '💾 Save Units';
                btn.style.background = '#1a1a2e'; btn.style.borderColor = '#7eb8f7';
            }, 3000);
            overlay.remove();
        };
    }

    function addButtons() {
        const target = document.querySelector('#propertyNameRow') ||
                       document.querySelector('h1.propertyName')?.parentElement;
        if (!target) { setTimeout(addButtons, 1000); return; }
        if (document.getElementById('apt-extractor-bar')) return;

        const bar = document.createElement('div');
        bar.id = 'apt-extractor-bar';
        bar.style.cssText = 'display:flex;gap:10px;align-items:center;padding:10px 0 6px;flex-wrap:wrap;';
        bar.innerHTML = `
            <button id="apt-save-btn" style="padding:8px 20px;background:#1a1a2e;color:#fff;
                border:2px solid #7eb8f7;border-radius:20px;cursor:pointer;font-size:13px;
                font-weight:700;font-family:sans-serif;">💾 Save Units</button>
            <button id="apt-view-btn" style="padding:8px 20px;background:#2980b9;color:#fff;
                border:none;border-radius:20px;cursor:pointer;font-size:13px;
                font-weight:700;font-family:sans-serif;">
                📊 View Tracker (<span id="apt-count">${getSaved().length}</span>)
            </button>
        `;
        target.insertAdjacentElement('afterend', bar);
        document.getElementById('apt-save-btn').onclick = showPicker;
        document.getElementById('apt-view-btn').onclick  = () => window.open(CONFIG.trackerUrl, '_blank');
    }

    setTimeout(addButtons, 1500);
})();