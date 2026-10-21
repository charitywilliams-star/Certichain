const STORAGE_KEY = "certichain.demo-ledger.v1";
const GENESIS_HASH = "0".repeat(64);

const sampleCertificates = [
	{
		certificateId: "CC-2024-00182",
		institution: "Northbridge University",
		graduateName: "Amina Okafor",
		award: "Bachelor of Science in Computer Science",
		year: "2024",
		reference: "NBU-CS-24-0182",
		issuedAt: "2024-06-14T10:30:00.000Z"
	},
	{
		certificateId: "CC-2023-00941",
		institution: "Westlake Institute of Technology",
		graduateName: "Daniel Mensah",
		award: "Master of Information Systems",
		year: "2023",
		reference: "WIT-MIS-23-0941",
		issuedAt: "2023-11-22T14:05:00.000Z"
	},
	{
		certificateId: "CC-2022-00407",
		institution: "Northbridge University",
		graduateName: "Leila Haddad",
		award: "Bachelor of Engineering in Civil Engineering",
		year: "2022",
		reference: "NBU-CE-22-0407",
		issuedAt: "2022-07-08T09:15:00.000Z"
	}
];

const navButtons = document.querySelectorAll("[data-view]");
const viewPanels = document.querySelectorAll(".view-panel");
const breadcrumbCurrent = document.querySelector("#breadcrumb-current");
const verifyForm = document.querySelector("#verify-form");
const verifyInput = document.querySelector("#certificate-id");
const verifyResult = document.querySelector("#verify-result");
const registerForm = document.querySelector("#register-form");
const registerFeedback = document.querySelector("#register-feedback");
const recentList = document.querySelector("#recent-list");
const ledgerTableBody = document.querySelector("#ledger-table-body");
const ledgerCount = document.querySelector("#ledger-count");
const latestHash = document.querySelector("#latest-hash");
const ledgerSummary = document.querySelector("#ledger-summary");
const toast = document.querySelector("#toast");

let certificates = [];
let toastTimer;

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;"
	})[character]);
}

function canonicalRecord(record) {
	return JSON.stringify({
		index: record.index,
		certificateId: record.certificateId,
		institution: record.institution,
		graduateName: record.graduateName,
		award: record.award,
		year: record.year,
		reference: record.reference,
		issuedAt: record.issuedAt,
		previousHash: record.previousHash
	});
}

async function hashRecord(record) {
	const bytes = new TextEncoder().encode(canonicalRecord(record));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createChain(records) {
	let previousHash = GENESIS_HASH;
	const chained = [];

	for (let index = 0; index < records.length; index += 1) {
		const record = { ...records[index], index: index + 1, previousHash };
		record.hash = await hashRecord(record);
		chained.push(record);
		previousHash = record.hash;
	}

	return chained;
}

function readStoredRecords() {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
		if (Array.isArray(saved)) return saved;
	} catch (error) {
		showToast("Saved demo records could not be read. Starting a fresh ledger.");
	}
	return null;
}

async function loadLedger() {
	const stored = readStoredRecords();
	certificates = stored ?? await createChain(sampleCertificates);
	if (!stored) saveLedger();
	renderLedger();
	if (!(await auditLedger()).valid) showToast("Saved ledger integrity check failed. Records are preserved for inspection.");
}

function saveLedger() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(certificates));
	} catch (error) {
		showToast("Browser storage is unavailable. Changes may not persist after reload.");
	}
}

async function auditLedger() {
	let previousHash = GENESIS_HASH;

	for (let index = 0; index < certificates.length; index += 1) {
		const record = certificates[index];
		if (record.index !== index + 1 || record.previousHash !== previousHash || record.hash !== await hashRecord(record)) {
			return { valid: false, block: index + 1 };
		}
		previousHash = record.hash;
	}

	return { valid: true };
}

function formatDate(value) {
	return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function renderLedger() {
	ledgerCount.textContent = String(certificates.length).padStart(2, "0");
	latestHash.textContent = certificates.at(-1)?.hash ?? GENESIS_HASH;
	ledgerSummary.textContent = `${certificates.length} ${certificates.length === 1 ? "record" : "records"} in the local demonstration ledger`;

	const recent = [...certificates].reverse().slice(0, 4);
	recentList.innerHTML = recent.length ? recent.map((record) => `
		<article class="recent-item">
			<span class="recent-index">${String(record.index).padStart(2, "0")}</span>
			<div><p class="recent-title">${escapeHtml(record.award)}</p><p class="recent-meta">${escapeHtml(record.institution)} · ${escapeHtml(record.year)}</p></div>
			<span class="recent-id">${escapeHtml(record.certificateId)}</span>
		</article>`).join("") : '<div class="empty-state">No certificate records yet.</div>';

	ledgerTableBody.innerHTML = certificates.length ? [...certificates].reverse().map((record) => `
		<tr>
			<td>#${String(record.index).padStart(4, "0")}</td>
			<td>${escapeHtml(record.certificateId)}</td>
			<td>${escapeHtml(record.institution)}</td>
			<td>${escapeHtml(record.award)}</td>
			<td>${escapeHtml(formatDate(record.issuedAt))}</td>
			<td><span class="chain-status">Linked</span></td>
		</tr>`).join("") : '<tr><td class="table-empty" colspan="6">No certificate records have been registered.</td></tr>';
}

function switchView(viewName) {
	const titles = { verify: "Verify credential", register: "Register credential", ledger: "Ledger explorer" };
	viewPanels.forEach((panel) => {
		const active = panel.id === `view-${viewName}`;
		panel.hidden = !active;
		panel.classList.toggle("is-visible", active);
	});
	document.querySelectorAll(".nav-link").forEach((button) => {
		const active = button.dataset.view === viewName;
		button.classList.toggle("is-active", active);
		if (active) button.setAttribute("aria-current", "page");
		else button.removeAttribute("aria-current");
	});
	breadcrumbCurrent.textContent = titles[viewName];
	if (viewName === "ledger") renderLedger();
}

function renderVerification(record, searchedId) {
	if (!record) {
		verifyResult.innerHTML = `
			<div class="result-card is-invalid">
				<span class="result-icon" aria-hidden="true">!</span>
				<div><h3 class="result-title">No matching record found</h3><p class="result-subtitle">${escapeHtml(searchedId)} is not present in the current ledger. Check the ID or contact the issuing institution.</p></div>
				<span class="result-badge">NOT FOUND</span>
			</div>`;
		return;
	}

	verifyResult.innerHTML = `
		<div class="result-card">
			<span class="result-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m5 10 3.2 3.2L15 6.5"></path></svg></span>
			<div><h3 class="result-title">Record found in the ledger</h3><p class="result-subtitle">The certificate ID and record hash match this local demonstration ledger.</p></div>
			<span class="result-badge">DEMO MATCH</span>
			<div class="result-details">
				<div><span class="result-detail-label">GRADUATE</span><span class="result-detail-value">${escapeHtml(record.graduateName)}</span></div>
				<div><span class="result-detail-label">AWARD</span><span class="result-detail-value">${escapeHtml(record.award)}</span></div>
				<div><span class="result-detail-label">ISSUER</span><span class="result-detail-value">${escapeHtml(record.institution)}</span></div>
				<div><span class="result-detail-label">YEAR AWARDED</span><span class="result-detail-value">${escapeHtml(record.year)}</span></div>
				<div><span class="result-detail-label">ISSUED</span><span class="result-detail-value">${escapeHtml(formatDate(record.issuedAt))}</span></div>
				<div><span class="result-detail-label">BLOCK HASH</span><span class="result-detail-value">${escapeHtml(record.hash.slice(0, 16))}…</span></div>
			</div>
		</div>`;
}

verifyForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const searchedId = verifyInput.value.trim();
	if (!searchedId) return;
	const record = certificates.find((item) => item.certificateId.toLowerCase() === searchedId.toLowerCase());
	renderVerification(record, searchedId);
	if (record) {
		const audit = await auditLedger();
		if (!audit.valid) {
			verifyResult.querySelector(".result-title").textContent = "Record found, but ledger integrity failed";
			verifyResult.querySelector(".result-subtitle").textContent = `The chain audit failed at block ${audit.block}. Do not rely on this record.`;
			verifyResult.querySelector(".result-badge").textContent = "AUDIT FAILED";
			verifyResult.querySelector(".result-card").classList.add("is-invalid");
			verifyResult.querySelector(".result-icon").textContent = "!";
		}
	}
});

document.querySelectorAll("[data-sample-id]").forEach((button) => {
	button.addEventListener("click", () => {
		verifyInput.value = button.dataset.sampleId;
		verifyForm.requestSubmit();
		verifyInput.focus();
	});
});

registerForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const audit = await auditLedger();
	if (!audit.valid) {
		registerFeedback.classList.add("is-error");
		registerFeedback.textContent = `The ledger audit failed at block ${audit.block}. Registration is disabled to preserve the invalid chain for inspection.`;
		return;
	}

	const formData = new FormData(registerForm);
	const certificateId = String(formData.get("certificateId")).trim();
	const duplicate = certificates.some((record) => record.certificateId.toLowerCase() === certificateId.toLowerCase());

	if (duplicate) {
		registerFeedback.classList.add("is-error");
		registerFeedback.textContent = "That certificate ID is already registered. Each ledger entry must have a unique ID.";
		return;
	}

	const year = Number(formData.get("year"));
	if (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1) {
		registerFeedback.classList.add("is-error");
		registerFeedback.textContent = "Enter a valid award year.";
		return;
	}

	const record = {
		certificateId,
		institution: String(formData.get("institution")).trim(),
		graduateName: String(formData.get("graduateName")).trim(),
		award: String(formData.get("award")).trim(),
		year: String(year),
		reference: String(formData.get("reference")).trim(),
		issuedAt: new Date().toISOString()
	};

	certificates = await createChain([...certificates.map(({ index, previousHash, hash, ...item }) => item), record]);
	saveLedger();
	renderLedger();
	registerForm.reset();
	registerFeedback.classList.remove("is-error");
	registerFeedback.textContent = `Credential ${record.certificateId} was added as block ${certificates.length}. Its hash is linked to the previous ledger entry.`;
});

document.querySelector("#audit-button").addEventListener("click", async () => {
	const result = await auditLedger();
	const auditResult = document.querySelector("#audit-result");
	auditResult.classList.toggle("is-error", !result.valid);
	auditResult.textContent = result.valid
		? `Chain verified: all ${certificates.length} record${certificates.length === 1 ? "" : "s"} match their SHA-256 hashes and previous-block links.`
		: `Chain integrity failed at block ${result.block}. The record or its chain link may have been altered.`;
});

navButtons.forEach((button) => {
	button.addEventListener("click", () => switchView(button.dataset.view));
});

function showToast(message) {
	toast.textContent = message;
	toast.classList.add("is-visible");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3800);
}

const aboutDialog = document.querySelector("#about-dialog");
document.querySelector("#about-button").addEventListener("click", () => aboutDialog.showModal());
document.querySelector("#close-dialog").addEventListener("click", () => aboutDialog.close());
document.querySelector("#dialog-done").addEventListener("click", () => aboutDialog.close());
aboutDialog.addEventListener("click", (event) => {
	if (event.target === aboutDialog) aboutDialog.close();
});

if (!globalThis.crypto?.subtle) {
	showToast("Secure browser context required for SHA-256. Open this page on localhost or HTTPS.");
} else {
	loadLedger();
}
