/* ============================================================
   SISTEMA DE EVALUACIÓN AUTOMATIZADA — LÓGICA PRINCIPAL
   ============================================================ */

// ─── Configuración de workers ───────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ─── DICCIONARIOS DE EVALUACIÓN (con pesos) ─────────────────
const DIC_LEY = [
    { word: "ley",              weight: 1.5 },
    { word: "norma",            weight: 1.2 },
    { word: "decreto supremo",  weight: 2.0 },
    { word: "decreto",          weight: 1.0 },
    { word: "derecho",          weight: 1.0 },
    { word: "mtpe",             weight: 1.5 },
    { word: "artículo",         weight: 1.0 },
    { word: "reglamento",       weight: 1.3 },
    { word: "ley 29381",        weight: 2.5 },
    { word: "ley 27942",        weight: 2.5 },
    { word: "ley 28518",        weight: 2.5 },
    { word: "beneficio social", weight: 1.5 },
    { word: "acoso laboral",    weight: 2.0 },
    { word: "flexibilidad",     weight: 1.0 },
    { word: "constitución",     weight: 2.0 },
    { word: "jurisprudencia",   weight: 2.0 },
];

const DIC_EVIDENCIA = [
    { word: "sunafil",          weight: 2.5 },
    { word: "resolución",       weight: 1.5 },
    { word: "noticia",          weight: 1.0 },
    { word: "empresa",          weight: 0.8 },
    { word: "reportaje",        weight: 1.2 },
    { word: "fuente",           weight: 1.0 },
    { word: "http",             weight: 1.5 },
    { word: "https",            weight: 1.5 },
    { word: "caso real",        weight: 2.0 },
    { word: "evidencia",        weight: 1.5 },
    { word: "multa",            weight: 1.5 },
    { word: "denuncia",         weight: 1.5 },
    { word: "estadística",      weight: 1.3 },
    { word: "sentencia",        weight: 2.0 },
];

const DIC_RRHH = [
    { word: "recursos humanos", weight: 2.0 },
    { word: "rr.hh",            weight: 1.5 },
    { word: "rrhh",             weight: 1.5 },
    { word: "ética",            weight: 1.5 },
    { word: "código de ética",  weight: 2.5 },
    { word: "postura",          weight: 1.0 },
    { word: "protocolo",        weight: 1.3 },
    { word: "capacitación",     weight: 1.5 },
    { word: "prevención",       weight: 1.5 },
    { word: "estrategia",       weight: 1.2 },
    { word: "compromiso",       weight: 1.2 },
    { word: "bienestar laboral",weight: 2.0 },
    { word: "clima laboral",    weight: 1.8 },
    { word: "liderazgo",        weight: 1.3 },
    { word: "inclusión",        weight: 1.5 },
];

const CONECTORES = [
    "en primer lugar", "a continuación", "primero", "para terminar", "finalmente",
    "por otra parte", "en cuanto a", "acerca de", "con relación a", "por tanto",
    "por consiguiente", "como resultado", "por lo cual", "de ahí que", "sin embargo",
    "no obstante", "en cambio", "por el contrario", "en mi opinión", "desde mi perspectiva",
    "considero", "es decir", "en efecto", "dicho de otra manera", "en conclusión", "en resumen",
    "asimismo", "además", "igualmente", "en consecuencia",
];

// ─── ESTADO GLOBAL ──────────────────────────────────────────
let resultadosEvaluacion = [];
let erroresProcesamiento  = [];
let archivosDetectados    = [];  // { name, type, size, file }

// Helper para no bloquear el hilo de renderizado
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

// ─── REFERENCIAS DOM ────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);

const dropZone        = $('#drop-zone');
const fileInput       = $('#file-input');
const folderInput     = $('#folder-input');
const fileList        = $('#file-list');
const fileListCont    = $('#file-list-container');
const fileCount       = $('#file-count');
const statusText      = $('#status-text');
const tableBody       = $('#table-body');
const btnPdf          = $('#btn-export-pdf');
const btnCsv          = $('#btn-export-csv');
const btnClear        = $('#btn-clear');
const btnSelectFiles  = $('#btn-select-files');
const btnSelectFolder = $('#btn-select-folder');
const filterInput     = $('#filter-input');
const filterBar       = $('#filter-bar');
const errorPanel      = $('#error-panel');
const errorMessage    = $('#error-message');
const loadingOverlay  = $('#loading-overlay');
const loadingMsg      = $('#loading-message');
const loadingProgress = $('#loading-progress');
const statsSummary    = $('#stats-summary');
const statTotal       = $('#stat-total');
const statPdf         = $('#stat-pdf');
const statDocx        = $('#stat-docx');
const statZip         = $('#stat-zip');

// ─── INICIALIZACIÓN ─────────────────────────────────────────
function init() {
    bindDragDrop();
    bindButtons();
    bindFilter();
    bindErrorDismiss();
    bindDropZoneKeyboard();
}

// ─── DRAG & DROP ────────────────────────────────────────────
function bindDragDrop() {
    const events = ['dragenter', 'dragover', 'dragleave', 'drop'];

    events.forEach(ev => {
        dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    dropZone.addEventListener('dragenter', () => dropZone.classList.add('dragover'));
    dropZone.addEventListener('dragover',  () => dropZone.classList.add('dragover'));
    dropZone.addEventListener('dragleave', (e) => {
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('dragover');
        }
    });
    dropZone.addEventListener('drop', (e) => {
        dropZone.classList.remove('dragover');
        const items = e.dataTransfer.items;
        if (items) {
            collectFilesFromDataTransfer(items);
        } else {
            const files = Array.from(e.dataTransfer.files);
            handleIncomingFiles(files);
        }
    });

    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        handleIncomingFiles(files);
        fileInput.value = '';
    });

    folderInput.addEventListener('change', () => {
        const files = Array.from(folderInput.files);
        handleIncomingFiles(files);
        folderInput.value = '';
    });
}

// ─── RECOLECCIÓN DE ARCHIVOS EN CARPETAS ────────────────────
async function collectFilesFromDataTransfer(items) {
    const allFiles = [];

    async function traverse(item) {
        if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) allFiles.push(file);
        } else if (item.kind === 'directory' || item.webkitGetAsEntry) {
            const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
            if (entry && entry.isDirectory) {
                await readDirectory(entry, allFiles);
            } else if (entry && entry.isFile) {
                const file = await entryToFile(entry);
                if (file) allFiles.push(file);
            }
        }
    }

    for (let i = 0; i < items.length; i++) {
        await traverse(items[i]);
    }

    handleIncomingFiles(allFiles);
}

function readDirectory(dirEntry, accumulator) {
    return new Promise((resolve) => {
        const reader = dirEntry.createReader();
        const readBatch = () => {
            reader.readEntries(async (entries) => {
                if (entries.length === 0) { resolve(); return; }
                for (const entry of entries) {
                    if (entry.isFile) {
                        const file = await entryToFile(entry);
                        if (file) accumulator.push(file);
                    } else if (entry.isDirectory) {
                        await readDirectory(entry, accumulator);
                    }
                }
                readBatch();
            });
        };
        readBatch();
    });
}

function entryToFile(entry) {
    return new Promise((resolve) => {
        entry.file((file) => resolve(file), () => resolve(null));
    });
}

// ─── MANEJO DE ARCHIVOS ENTRANTES ───────────────────────────
function handleIncomingFiles(files) {
    if (!files || files.length === 0) return;

    const validExtensions = ['.pdf', '.docx', '.zip'];
    const validFiles = files.filter(f => {
        // Ignorar metadatos de sistema (macOS / Windows)
        if (isSystemOrHiddenFile(f.name)) return false;
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        return validExtensions.includes(ext);
    });

    if (validFiles.length === 0) {
        showError('No se encontraron archivos válidos. Formatos aceptados: PDF, DOCX, ZIP.');
        return;
    }

    archivosDetectados = validFiles.map(f => ({
        name: f.name,
        type: f.name.split('.').pop().toLowerCase(),
        size: f.size,
        file: f,
    }));

    renderFileList();
    updateStats(archivosDetectados);
    processAllFiles();
}

// ─── FILTRO DE ARCHIVOS DE SISTEMA / OCULTOS ────────────────
function isSystemOrHiddenFile(path) {
    const fileName = path.split('/').pop();
    return (
        path.includes('__MACOSX') ||
        fileName.startsWith('._') ||
        fileName.startsWith('.') ||
        fileName.toLowerCase() === 'thumbs.db' ||
        fileName.toLowerCase() === 'desktop.ini'
    );
}

// ─── RENDERIZAR LISTA DE ARCHIVOS ───────────────────────────
function renderFileList() {
    fileList.innerHTML = '';
    const iconMap = { pdf: '📕', docx: '📘', zip: '📦' };

    archivosDetectados.forEach((f, i) => {
        const li = document.createElement('li');
        li.innerHTML =
            `<span class="file-icon">${iconMap[f.type] || '📄'}</span>` +
            `<span>${escapeHTML(f.name)}</span>` +
            `<button class="file-remove" data-index="${i}" aria-label="Quitar ${escapeHTML(f.name)}">&times;</button>`;
        fileList.appendChild(li);
    });

    fileList.querySelectorAll('.file-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            archivosDetectados.splice(idx, 1);
            renderFileList();
            updateStats(archivosDetectados);
            if (archivosDetectados.length === 0) {
                fileListCont.hidden = true;
                btnClear.disabled = true;
            }
        });
    });

    fileListCont.hidden = false;
    fileCount.textContent = archivosDetectados.length;
    btnClear.disabled = false;
}

// ─── ACTUALIZAR ESTADÍSTICAS ────────────────────────────────
function updateStats(list) {
    const total = list.length;
    const pdfs  = list.filter(f => f.type === 'pdf').length;
    const docxs = list.filter(f => f.type === 'docx').length;
    const zips  = list.filter(f => f.type === 'zip').length;

    statTotal.textContent = `${total} documento${total !== 1 ? 's' : ''}`;
    statPdf.textContent   = `${pdfs} PDF`;
    statDocx.textContent  = `${docxs} DOCX`;
    statZip.textContent   = `${zips} ZIP`;

    statsSummary.hidden = total === 0;
}

// ─── PROCESAR TODOS LOS ARCHIVOS ────────────────────────────
async function processAllFiles() {
    if (archivosDetectados.length === 0) return;

    resultadosEvaluacion = [];
    erroresProcesamiento = [];
    hideError();

    showLoading('Preparando procesamiento...', 0);
    await yieldToMain();

    // Fase 1: Descomprimir ZIPs de forma recursiva y aplanar la lista
    const flatFiles = [];
    for (let i = 0; i < archivosDetectados.length; i++) {
        const entry = archivosDetectados[i];
        if (entry.type === 'zip') {
            updateLoading(`Descomprimiendo: ${entry.name}`, 10);
            await yieldToMain();
            try {
                const extracted = await extractZip(entry.file);
                if (extracted.length === 0) {
                    erroresProcesamiento.push(`${entry.name}: El archivo ZIP no contiene documentos válidos (PDF/DOCX).`);
                } else {
                    flatFiles.push(...extracted);
                }
            } catch (err) {
                console.error(`Error al descomprimir ${entry.name}:`, err);
                erroresProcesamiento.push(`${entry.name}: Error al descomprimir ZIP (${err.message || 'archivo dañado'}).`);
            }
        } else {
            flatFiles.push(entry);
        }
    }

    // Actualizar el panel de estadísticas con la lista real de documentos extraídos
    updateStats(flatFiles);

    if (flatFiles.length === 0) {
        hideLoading();
        showError('No se encontraron documentos evaluables dentro de los archivos cargados.');
        statusText.textContent = '⚠️ No hay documentos válidos para evaluar.';
        return;
    }

    // Fase 2: Procesar e inspeccionar cada documento
    const total = flatFiles.length;
    for (let i = 0; i < total; i++) {
        const entry = flatFiles[i];
        const progress = Math.round(((i + 1) / total) * 100);
        updateLoading(`Evaluando (${i + 1}/${total}): ${entry.name}`, progress);
        await yieldToMain();

        try {
            let text = '';
            if (entry.type === 'pdf') {
                text = await extractTextFromPDF(entry.file);
            } else if (entry.type === 'docx') {
                text = await extractTextFromDOCX(entry.file);
            } else {
                erroresProcesamiento.push(`${entry.name}: Formato no soportado.`);
                continue;
            }

            if (!text || text.trim().length < 20) {
                erroresProcesamiento.push(`${entry.name}: Texto insuficiente o escaneado (se requiere texto seleccionable).`);
                continue;
            }

            const evalResult = evaluateContent(entry.name, text);
            resultadosEvaluacion.push(evalResult);

        } catch (err) {
            console.error(`Error procesando ${entry.name}:`, err);
            erroresProcesamiento.push(`${entry.name}: ${err.message || 'Error al leer el documento.'}`);
        }
    }

    hideLoading();

    // Mostrar errores si existieran
    if (erroresProcesamiento.length > 0) {
        showError(`${erroresProcesamiento.length} archivo(s) no se pudieron procesar:\n` +
            erroresProcesamiento.slice(0, 5).join('\n') +
            (erroresProcesamiento.length > 5 ? '\n...' : ''));
    }

    // Actualizar UI
    statusText.textContent = resultadosEvaluacion.length > 0
        ? `✅ Proceso completado: ${resultadosEvaluacion.length} estudiante(s) evaluado(s).`
        : '⚠️ No se pudo evaluar ningún documento. Revisa los formatos.';

    renderTable();

    const hayResultados = resultadosEvaluacion.length > 0;
    btnPdf.disabled = !hayResultados;
    btnCsv.disabled = !hayResultados;
    filterBar.hidden = !hayResultados;
}

// ─── EXTRACCIÓN ZIP (RECURSIVA Y REFINADA) ───────────────────
async function extractZip(zipFile, depth = 0) {
    if (depth > 5) return []; // Control de recursión para evitar bucles infinitos
    const extracted = [];
    
    // JSZip debe estar cargado en el scope global por index.html
    if (typeof JSZip === 'undefined') {
        throw new Error('La librería JSZip no se ha cargado correctamente.');
    }

    const zip = await JSZip.loadAsync(zipFile);
    const entries = Object.entries(zip.files);

    for (const [path, zipEntry] of entries) {
        // Omitir directorios explícitos y archivos fantasma/sistema
        if (zipEntry.dir || isSystemOrHiddenFile(path)) continue;

        const fileName = path.split('/').pop();
        const ext = '.' + fileName.split('.').pop().toLowerCase();

        if (['.pdf', '.docx'].includes(ext)) {
            const blob = await zipEntry.async('blob');
            const file = new File([blob], fileName, { 
                type: ext === '.pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
            });

            extracted.push({
                name: fileName,
                type: ext.replace('.', ''),
                size: blob.size,
                file: file,
            });
        } else if (ext === '.zip') {
            // Descompresión recursiva de archivos ZIP anidados
            const zipBlob = await zipEntry.async('blob');
            const nestedZipFile = new File([zipBlob], fileName, { type: 'application/zip' });
            const subFiles = await extractZip(nestedZipFile, depth + 1);
            extracted.push(...subFiles);
        }
    }

    return extracted;
}

// ─── EXTRACCIÓN DE TEXTO: PDF ───────────────────────────────
async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map(item => item.str)
            .join(' ')
            .replace(/\s+/g, ' ');
        fullText += pageText + ' ';
    }

    return fullText.toLowerCase().trim();
}

// ─── EXTRACCIÓN DE TEXTO: DOCX ──────────────────────────────
async function extractTextFromDOCX(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.toLowerCase().trim();
}

// ─── MOTOR DE EVALUACIÓN PONDERADO (0-20) ───────────────────
function evaluateContent(fileName, text) {
    // ── Criterio 1: Leyes y Normativa (0-5 pts) ──
    const scoreLey = computeWeightedScore(text, DIC_LEY, 5);
    let c1, obsLey = [];

    if (scoreLey >= 4.5) {
        c1 = 5;
    } else if (scoreLey >= 3.0) {
        c1 = 4;
        obsLey.push('Falta profundizar en la precisión del marco legal peruano.');
    } else if (scoreLey >= 1.5) {
        c1 = 2;
        obsLey.push('Marco legal muy general. Se recomienda citar normas específicas.');
    } else {
        c1 = 1;
        obsLey.push('Explicación muy general. Omitió citar normas legales específicas.');
    }

    // ── Criterio 2: Evidencias y Casos Reales (0-7 pts) ──
    const scoreEvid = computeWeightedScore(text, DIC_EVIDENCIA, 7);
    const tieneFuenteVerificable = text.includes('sunafil') ||
                                    text.includes('http') ||
                                    text.includes('resolución') ||
                                    text.includes('sentencia');
    let c2, obsEvid = [];

    if (scoreEvid >= 5.5 && tieneFuenteVerificable) {
        c2 = 7;
    } else if (scoreEvid >= 3.5) {
        c2 = 5;
        obsEvid.push('Menciona casos, pero falta precisar fuentes verificables (SUNAFIL/Noticias).');
    } else if (scoreEvid >= 1.5) {
        c2 = 3;
        obsEvid.push('Pocas evidencias. Incluir casos reales con fuentes.');
    } else {
        c2 = 1;
        obsEvid.push('Faltan casos reales con evidencia verificable.');
    }

    // ── Criterio 3: Ética y Rol de RR.HH. (0-8 pts) ──
    const scoreRRHH = computeWeightedScore(text, DIC_RRHH, 8);
    let c3, obsRRHH = [];

    if (scoreRRHH >= 6.5) {
        c3 = 8;
    } else if (scoreRRHH >= 4.0) {
        c3 = 6;
        obsRRHH.push('Buena base, pero la propuesta de acción para RR.HH. puede ser más específica.');
    } else if (scoreRRHH >= 2.0) {
        c3 = 3;
        obsRRHH.push('La propuesta de acción para el área de RR.HH. es genérica.');
    } else {
        c3 = 1;
        obsRRHH.push('No fundamenta la responsabilidad estratégica del área de RR.HH.');
    }

    // ── Conectores lógicos ──
    let conectoresHallados = 0;
    CONECTORES.forEach(c => {
        if (text.includes(c)) conectoresHallados++;
    });

    if (conectoresHallados < 3) {
        obsRRHH.push('Fortalecer el uso de conectores lógicos para la cohesión del texto.');
    }

    // ── Consolidar observaciones ──
    const todasObs = [...obsLey, ...obsEvid, ...obsRRHH];
    const observacion = todasObs.length > 0
        ? todasObs.join(' ')
        : '¡Excelente trabajo! Cumple con la estructura y rigor académico.';

    const notaFinal = c1 + c2 + c3;
    const estudiante = fileName.replace(/\.(pdf|docx)$/i, '').replace(/_/g, ' ');

    return {
        estudiante,
        c1,
        c2,
        c3,
        notaFinal,
        conectoresHallados,
        observacion,
    };
}

// ─── CÁLCULO DE PUNTAJE PONDERADO ───────────────────────────
function computeWeightedScore(text, dictionary, maxPoints) {
    let totalWeight = 0;
    dictionary.forEach(({ word, weight }) => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        const matches = text.match(regex);
        if (matches) {
            totalWeight += matches.length * weight;
        }
    });

    const maxTheoretical = dictionary.reduce((sum, { weight }) => sum + weight * 3, 0);
    const normalized = maxTheoretical > 0 ? (totalWeight / maxTheoretical) * maxPoints : 0;

    return Math.min(normalized, maxPoints);
}

// ─── RENDERIZAR TABLA ───────────────────────────────────────
function renderTable(filter) {
    filter = filter || '';
    tableBody.innerHTML = '';

    const filtered = filter.trim()
        ? resultadosEvaluacion.filter(r =>
            r.estudiante.toLowerCase().includes(filter.toLowerCase()))
        : resultadosEvaluacion;

    if (filtered.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" class="empty-msg">' +
            (filter ? 'No hay resultados que coincidan con el filtro.'
                    : 'No hay datos procesados. Sube archivos PDF, DOCX o ZIP para iniciar.') +
            '</td>';
        tableBody.appendChild(row);
        return;
    }

    filtered.forEach((res, index) => {
        const badgeClass = res.notaFinal >= 14
            ? 'badge-success'
            : (res.notaFinal >= 11 ? 'badge-warning' : 'badge-danger');

        const row = document.createElement('tr');
        row.innerHTML =
            `<td>${index + 1}</td>` +
            `<td><strong>${escapeHTML(res.estudiante)}</strong></td>` +
            `<td>${res.c1} / 5</td>` +
            `<td>${res.c2} / 7</td>` +
            `<td>${res.c3} / 8</td>` +
            `<td><span class="badge ${badgeClass}">${res.notaFinal} / 20</span></td>` +
            `<td>${res.conectoresHallados}</td>` +
            `<td style="font-size:0.82rem;color:#475569;">${escapeHTML(res.observacion)}</td>`;
        tableBody.appendChild(row);
    });
}

// ─── FILTRO DE BÚSQUEDA ─────────────────────────────────────
function bindFilter() {
    filterInput.addEventListener('input', () => {
        renderTable(filterInput.value);
    });
}

// ─── BOTONES ────────────────────────────────────────────────
function bindButtons() {
    btnSelectFiles.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    btnSelectFolder.addEventListener('click', (e) => {
        e.stopPropagation();
        folderInput.click();
    });

    btnClear.addEventListener('click', clearAll);

    btnCsv.addEventListener('click', exportCSV);
    btnPdf.addEventListener('click', exportPDF);
}

// ─── LIMPIAR TODO ───────────────────────────────────────────
function clearAll() {
    resultadosEvaluacion = [];
    erroresProcesamiento = [];
    archivosDetectados = [];
    tableBody.innerHTML = '<tr><td colspan="8" class="empty-msg">No hay datos procesados. Sube archivos PDF, DOCX o ZIP para iniciar.</td></tr>';
    fileList.innerHTML = '';
    fileListCont.hidden = true;
    statsSummary.hidden = true;
    filterBar.hidden = true;
    filterInput.value = '';
    statusText.textContent = 'Esperando archivos...';
    btnPdf.disabled = true;
    btnCsv.disabled = true;
    btnClear.disabled = true;
    hideError();
}

// ─── EXPORTAR CSV ───────────────────────────────────────────
function exportCSV() {
    const BOM = '\uFEFF';
    let csvContent = BOM + 'Estudiante,C1 Ley(5P),C2 Evidencias(7P),C3 RRHH(8P),Nota Final,Conectores,Observaciones\n';

    resultadosEvaluacion.forEach(r => {
        csvContent +=
            `"${r.estudiante}",${r.c1},${r.c2},${r.c3},${r.notaFinal},${r.conectoresHallados},"${r.observacion}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Reporte_Evaluacion_RRHH_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ─── EXPORTAR PDF ───────────────────────────────────────────
function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(16);
    doc.text('Reporte Consolidado de Evaluación Académica', 14, 15);
    doc.setFontSize(10);
    doc.text('Programa de Gestión Humana y Derecho Laboral | Escala Vigesimal (0-20)', 14, 22);
    doc.text('Fecha: ' + new Date().toLocaleDateString('es-PE') +
             ' | Documentos evaluados: ' + resultadosEvaluacion.length, 14, 28);

    const tableData = resultadosEvaluacion.map((r, i) => [
        i + 1,
        r.estudiante,
        r.c1 + '/5',
        r.c2 + '/7',
        r.c3 + '/8',
        r.notaFinal + '/20',
        r.conectoresHallados.toString(),
        r.observacion,
    ]);

    doc.autoTable({
        startY: 34,
        head: [['#', 'Estudiante', 'C1 (5P)', 'C2 (7P)', 'C3 (8P)', 'Nota', 'Conect.', 'Observaciones de Fortalecimiento']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [0, 119, 182] },
        styles: { fontSize: 7.5, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 40 },
            7: { cellWidth: 70 },
        },
    });

    doc.save('Reporte_Consolidado_Evaluaciones_' + new Date().toISOString().slice(0, 10) + '.pdf');
}

// ─── OVERLAY DE CARGA ───────────────────────────────────────
function showLoading(message, progress) {
    loadingMsg.textContent = message;
    loadingProgress.value = progress;
    loadingOverlay.hidden = false;
}

function updateLoading(message, progress) {
    loadingMsg.textContent = message;
    loadingProgress.value = progress;
}

function hideLoading() {
    loadingOverlay.hidden = true;
}

// ─── PANEL DE ERROR ─────────────────────────────────────────
function showError(msg) {
    errorMessage.textContent = msg;
    errorPanel.hidden = false;
}

function hideError() {
    errorPanel.hidden = true;
}

function bindErrorDismiss() {
    errorPanel.querySelector('.error-dismiss').addEventListener('click', hideError);
}

// ─── ACCESIBILIDAD ──────────────────────────────────────────
function bindDropZoneKeyboard() {
    dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── ARRANQUE ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
