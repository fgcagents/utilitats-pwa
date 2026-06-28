document.addEventListener("DOMContentLoaded", () => {
    // Calculadora de devolucions per a bitllets de transport.
    // Motor basat en devo_2.html: compra - anul·lació = import a retornar.

    const ORIGINAL_TICKETS = [
        { name: 'SENZILL (1Z)', euros: 2.90 },
        { name: 'SENZILL (2Z)', euros: 4.15 },
        { name: 'SENZILL (3Z)', euros: 5.40 },
        { name: 'PENSIONISTA A 75% (1Z)', euros: 0.75 },
        { name: 'PENSIONISTA A 75% (2Z)', euros: 1.05 },
        { name: 'PENSIONISTA A 75% (3Z)', euros: 1.35 },
        { name: 'PENSIONISTA B 50% (1Z)', euros: 1.45 },
        { name: 'PENSIONISTA B 50% (2Z)', euros: 2.10 },
        { name: 'PENSIONISTA B 50% (3Z)', euros: 2.70 }
    ];

    const MAX_PER_SIDE = 5;
    const TARGET_MIN = 5;
    const TARGET_MAX = 1000;
    const TARGET_STEP = 5;
    const ticketTypes = cloneTickets(ORIGINAL_TICKETS);
    const operacionsPerDiferencia = buildOperationsByDifference(generateCombinations());

    const formulari = document.getElementById('formulari');
    const errorDiv = document.getElementById('error');
    const resultatDiv = document.getElementById('resultat');
    const detallsDiv = document.getElementById('detalls');

    formulari.addEventListener('submit', function (e) {
        e.preventDefault();

        const importObjectiu = parseImportCents(document.getElementById('import').value);

        if (!Number.isInteger(importObjectiu) || importObjectiu < TARGET_MIN || importObjectiu > TARGET_MAX) {
            mostraError('Si us plau, introdueix un import vàlid entre 0,05 i 10 €.');
            ocultaResultat();
            return;
        }

        if (importObjectiu % TARGET_STEP !== 0) {
            mostraError('Si us plau, introdueix un import en salts de 0,05 €.');
            ocultaResultat();
            return;
        }

        ocultaError();
        mostraResultat();
        detallsDiv.innerHTML = '<p>Calculant...</p>';

        const combinacio = trobarCombinacio(importObjectiu);

        if (combinacio) {
            detallsDiv.innerHTML = generarTaula(combinacio);
        } else {
            detallsDiv.innerHTML = '<strong>Error:</strong> No s\'ha trobat cap combinació possible per a aquest import.';
        }
    });

    function mostraError(missatge) {
        errorDiv.textContent = missatge;
        errorDiv.style.display = 'block';
    }

    function ocultaError() {
        errorDiv.style.display = 'none';
    }

    function mostraResultat() {
        resultatDiv.style.display = 'block';
    }

    function ocultaResultat() {
        resultatDiv.style.display = 'none';
    }

    function cloneTickets(items) {
        return items.map(t => ({
            name: t.name,
            euros: Number(t.euros),
            cents: Math.round(Number(t.euros) * 100)
        }));
    }

    function parseImportCents(value) {
        const normalized = String(value || '').trim().replace('€', '').replace(',', '.');
        if (!normalized) return NaN;

        const numeric = Number(normalized);
        if (!Number.isFinite(numeric)) return NaN;

        return Math.round(numeric * 100);
    }

    function formatMoney(cents) {
        return (cents / 100).toLocaleString('ca-ES', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' €';
    }

    function generateCombinations() {
        const combos = [];

        ticketTypes.forEach((ticket, index) => {
            for (let qty = 1; qty <= MAX_PER_SIDE; qty++) {
                const counts = new Array(ticketTypes.length).fill(0);
                counts[index] = qty;

                combos.push({
                    sum: ticket.cents * qty,
                    count: qty,
                    counts,
                    distinct: 1,
                    ticketName: ticket.name,
                    text: ticket.name
                });
            }
        });

        return combos;
    }

    function operationSortKey(op) {
        return [
            op.ticketCount,
            op.moved,
            op.purchase.count,
            op.purchase.distinct + op.cancel.distinct,
            op.purchase.sum,
            op.purchase.text + '|' + op.cancel.text
        ];
    }

    function solutionSortKey(solution) {
        if (!solution) return [9, 999999, 999999, 999999, ''];
        return [
            solution.type === 'single' ? 1 : 2,
            solution.ticketCount,
            solution.moved,
            solution.operations.reduce((acc, op) => acc + op.purchase.count, 0),
            solution.operations.map(op => op.purchase.text + '|' + op.cancel.text).join('||')
        ];
    }

    function compareKeys(a, b) {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i] < b[i]) return -1;
            if (a[i] > b[i]) return 1;
        }
        return 0;
    }

    function betterOperation(a, b) {
        if (!a) return b;
        if (!b) return a;
        return compareKeys(operationSortKey(a), operationSortKey(b)) <= 0 ? a : b;
    }

    function betterSolution(a, b) {
        if (!a) return b;
        if (!b) return a;
        return compareKeys(solutionSortKey(a), solutionSortKey(b)) <= 0 ? a : b;
    }

    function buildOperationsByDifference(combos) {
        const bestByDiff = new Map();

        for (const purchase of combos) {
            for (const cancel of combos) {
                const diff = purchase.sum - cancel.sum;
                if (diff <= 0 || diff > TARGET_MAX) continue;

                const op = {
                    purchase,
                    cancel,
                    diff,
                    ticketCount: purchase.count + cancel.count,
                    moved: purchase.sum + cancel.sum
                };

                bestByDiff.set(diff, betterOperation(bestByDiff.get(diff), op));
            }
        }

        return bestByDiff;
    }

    function trobarCombinacio(importObjectiu) {
        const single = operacionsPerDiferencia.get(importObjectiu);

        if (single) {
            return {
                amount: importObjectiu,
                type: 'single',
                operations: [single],
                ticketCount: single.ticketCount,
                moved: single.moved
            };
        }

        const double = findBestTwoOperations(importObjectiu);
        return double ? { amount: importObjectiu, ...double } : null;
    }

    function findBestTwoOperations(target) {
        let best = null;

        for (let a = TARGET_STEP; a < target; a += TARGET_STEP) {
            const b = target - a;
            const opA = operacionsPerDiferencia.get(a);
            const opB = operacionsPerDiferencia.get(b);
            if (!opA || !opB) continue;

            const candidate = {
                type: 'double',
                operations: [opA, opB],
                ticketCount: opA.ticketCount + opB.ticketCount,
                moved: opA.moved + opB.moved
            };

            best = betterSolution(best, candidate);
        }

        return best;
    }

    function totalPurchase(solution) {
        return solution.operations.reduce((acc, op) => acc + op.purchase.sum, 0);
    }

    function totalCancel(solution) {
        return solution.operations.reduce((acc, op) => acc + op.cancel.sum, 0);
    }

    function generarTaula(combinacio) {
        let html = '';

        function generarFila(accio, combo) {
            return `<tr><td>${accio}</td><td>${combo.count}</td><td>${escapeHtml(combo.ticketName)}</td></tr>`;
        }

        function generarTextOperacio(op) {
            return `( ${formatMoney(op.purchase.sum)} - ${formatMoney(op.cancel.sum)} = ${formatMoney(op.diff)} )`;
        }

        function generarTaulaPart(op) {
            const textOperacio = generarTextOperacio(op);

            return `
                <table>
                    <thead>
                        <tr>
                            <th>Acció</th>
                            <th>Quantitat</th>
                            <th>Tipus</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generarFila('Comprar', op.purchase)}
                        ${generarFila('Anul·lar', op.cancel)}
                    </tbody>
                </table>
                <p class="import-total"><strong>Total:</strong> ${formatMoney(op.diff)}</p>
                <p class="operacio">${textOperacio}</p>
            `;
        }

        if (combinacio.type === 'single') {
            html += generarTaulaPart(combinacio.operations[0]);
        } else if (combinacio.type === 'double') {
            html += `<p style="color:#d35400; font-weight:bold; margin-bottom:10px;">CAL FER 2 OPERACIONS</p>`;

            combinacio.operations.forEach((op, index) => {
                const separatorStyle = index === 0 ? 'margin:5px 0;' : 'margin:15px 0 5px 0; border-top:1px dashed #ccc; padding-top:10px;';
                html += `<p style="${separatorStyle}"><strong>PAS ${index + 1}:</strong></p>`;
                html += generarTaulaPart(op);
            });

            html += `<p class="import-total" style="margin-top:15px; font-size: 1.1em; border-top: 2px solid #333; padding-top: 5px;"><strong>TOTAL FINAL:</strong> ${formatMoney(totalPurchase(combinacio) - totalCancel(combinacio))}</p>`;
        }

        return html;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>'"]/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[ch]));
    }

    // Actualitza l'any del footer
    document.getElementById('current-year').textContent = new Date().getFullYear();
});
