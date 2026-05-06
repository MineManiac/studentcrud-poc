const form = document.querySelector("#studentForm");
const formTitle = document.querySelector("#form-title");
const submitButton = document.querySelector("#submitButton");
const clearButton = document.querySelector("#clearButton");
const statusEl = document.querySelector("#status");
const messageEl = document.querySelector("#message");
const studentsBody = document.querySelector("#studentsBody");
const studentCount = document.querySelector("#studentCount");
const sortButtons = document.querySelectorAll("[data-sort-key]");

const fields = {
  id: document.querySelector("#studentId"),
  nome: document.querySelector("#nome"),
  dataNascimento: document.querySelector("#dataNascimento"),
  cep: document.querySelector("#cep"),
  logradouro: document.querySelector("#logradouro"),
  numero: document.querySelector("#numero"),
  complemento: document.querySelector("#complemento"),
  bairro: document.querySelector("#bairro"),
  cidade: document.querySelector("#cidade"),
  estado: document.querySelector("#estado"),
};

let students = [];
let lastResolvedCep = "";
let activeSort = { key: null, direction: null };
const addressLookupFields = [fields.logradouro, fields.bairro, fields.cidade, fields.estado];

function setStatus(online) {
  statusEl.textContent = online ? "MongoDB conectado" : "Sem conexao";
  statusEl.classList.toggle("online", online);
  statusEl.classList.toggle("offline", !online);
}

function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("show", Boolean(text));
  messageEl.classList.toggle("error", isError);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCep(value) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function toLocalInputDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setAddressReadonly(readonly) {
  addressLookupFields.forEach((field) => {
    field.readOnly = readonly;
    field.classList.toggle("readonly", readonly);
  });
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function toInputDate(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function isRealInputDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[char];
  });
}

function formatAddress(address) {
  const lineOne = [address.logradouro, address.numero].filter(Boolean).map(escapeHtml).join(", ");
  const lineTwo = [address.complemento, address.bairro].filter(Boolean).map(escapeHtml).join(" - ");
  const lineThree = [address.cidade, address.estado, address.cep]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" / ");

  return [lineOne, lineTwo, lineThree].filter(Boolean).join("<br />");
}

function payloadFromForm() {
  return {
    nome: fields.nome.value.trim(),
    dataNascimento: fields.dataNascimento.value,
    endereco: {
      cep: formatCep(fields.cep.value),
      logradouro: fields.logradouro.value.trim(),
      numero: fields.numero.value.trim(),
      complemento: fields.complemento.value.trim(),
      bairro: fields.bairro.value.trim(),
      cidade: fields.cidade.value.trim(),
      estado: fields.estado.value.trim().toUpperCase(),
    },
  };
}

function setFormMode(student = null) {
  fields.id.value = student?.id || "";
  formTitle.textContent = student ? `Editando codigo ${student.codigo}` : "Novo aluno";
  submitButton.textContent = student ? "Salvar edicao" : "Cadastrar aluno";

  if (!student) {
    form.reset();
    lastResolvedCep = "";
    setAddressReadonly(false);
    document.querySelectorAll("tbody tr").forEach((row) => row.classList.remove("selected"));
    fields.nome.focus();
    return;
  }

  fields.nome.value = student.nome || "";
  fields.dataNascimento.value = toInputDate(student.dataNascimento);
  fields.cep.value = formatCep(student.endereco?.cep || "");
  fields.logradouro.value = student.endereco?.logradouro || "";
  fields.numero.value = student.endereco?.numero || "";
  fields.complemento.value = student.endereco?.complemento || "";
  fields.bairro.value = student.endereco?.bairro || "";
  fields.cidade.value = student.endereco?.cidade || "";
  fields.estado.value = student.endereco?.estado || "";
  lastResolvedCep = onlyDigits(fields.cep.value);
  setAddressReadonly(true);
}

function fillAddressFromCep(address) {
  lastResolvedCep = onlyDigits(fields.cep.value);
  fields.logradouro.value = address.logradouro || "";
  fields.bairro.value = address.bairro || "";
  fields.cidade.value = address.localidade || "";
  fields.estado.value = address.uf || "";
  fields.numero.value = "";
  fields.complemento.value = "";
  addressLookupFields.forEach((field) => {
    const hasValue = Boolean(field.value.trim());
    field.readOnly = hasValue;
    field.classList.toggle("readonly", hasValue);
  });
}

async function lookupCep() {
  const cep = onlyDigits(fields.cep.value);
  fields.cep.value = formatCep(cep);

  if (!cep) {
    lastResolvedCep = "";
    setAddressReadonly(false);
    return true;
  }

  if (cep === lastResolvedCep) {
    return true;
  }

  if (cep.length !== 8) {
    lastResolvedCep = "";
    showMessage("Informe um CEP com 8 digitos.", true);
    setAddressReadonly(false);
    return false;
  }

  showMessage("Buscando endereco pelo CEP...");

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const address = await response.json();

    if (!response.ok || address.erro) {
      lastResolvedCep = "";
      setAddressReadonly(false);
      showMessage("CEP nao encontrado. Preencha o endereco manualmente.", true);
      return false;
    }

    fillAddressFromCep(address);
    fields.numero.focus();
    showMessage("Endereco preenchido pelo CEP.");
    return true;
  } catch (error) {
    lastResolvedCep = "";
    setAddressReadonly(false);
    showMessage("Nao foi possivel consultar o CEP agora.", true);
    return false;
  }
}

function validateFormBeforeSubmit() {
  const birthDate = fields.dataNascimento.value;

  if (!isRealInputDate(birthDate)) {
    return "Informe uma data de nascimento valida.";
  }

  if (birthDate < fields.dataNascimento.min || birthDate > fields.dataNascimento.max) {
    return "A data de nascimento deve estar entre 01/01/1900 e hoje.";
  }

  if (onlyDigits(fields.cep.value).length !== 8) {
    return "Informe um CEP valido com 8 digitos.";
  }

  return null;
}

function getVisibleStudents() {
  if (!activeSort.key || !activeSort.direction) {
    return students;
  }

  return [...students].sort((first, second) => {
    const firstValue = getSortValue(first, activeSort.key);
    const secondValue = getSortValue(second, activeSort.key);
    const comparison = firstValue - secondValue;

    return activeSort.direction === "asc" ? comparison : -comparison;
  });
}

function getSortValue(student, key) {
  if (key === "codigo") {
    return Number(student.codigo || 0);
  }

  return new Date(student[key]).getTime() || 0;
}

function updateSortButtons() {
  sortButtons.forEach((button) => {
    const isActive = button.dataset.sortKey === activeSort.key;
    const direction = isActive ? activeSort.direction : null;
    const indicator = button.querySelector(".sort-indicator");
    const label = button.dataset.sortLabel;
    const nextDirection = direction === "desc" ? "crescente" : "decrescente";

    button.setAttribute("aria-label", `Ordenar ${label} em ordem ${nextDirection}`);
    indicator.classList.toggle("asc", direction === "asc");
    indicator.classList.toggle("desc", direction === "desc");
  });
}

function renderStudents() {
  studentCount.textContent = `${students.length} registro${students.length === 1 ? "" : "s"}`;
  updateSortButtons();

  if (students.length === 0) {
    studentsBody.innerHTML = '<tr><td colspan="7" class="empty">Nenhum aluno cadastrado.</td></tr>';
    return;
  }

  studentsBody.innerHTML = getVisibleStudents()
    .map(
      (student) => `
        <tr data-id="${student.id}" class="${student.id === fields.id.value ? "selected" : ""}">
          <td class="code-cell">${student.codigo}</td>
          <td>${escapeHtml(student.nome)}</td>
          <td>${formatDate(student.dataNascimento)}</td>
          <td class="address-cell">${formatAddress(student.endereco || {})}</td>
          <td>${formatDateTime(student.dataCadastro)}</td>
          <td>${formatDateTime(student.ultimoUpdate)}</td>
          <td>
            <button class="danger-button" type="button" data-delete-id="${student.id}">
              Excluir
            </button>
          </td>
        </tr>
      `
    )
    .join("");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "Nao foi possivel completar a operacao.");
  }

  return data;
}

async function loadStudents() {
  try {
    students = await requestJson("/api/students");
    setStatus(true);
    renderStudents();
  } catch (error) {
    setStatus(false);
    showMessage(error.message, true);
    studentsBody.innerHTML =
      '<tr><td colspan="7" class="empty">Nao foi possivel carregar os registros.</td></tr>';
  }
}

studentsBody.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-id]");

  if (deleteButton) {
    deleteStudent(deleteButton.dataset.deleteId);
    return;
  }

  const row = event.target.closest("tr[data-id]");
  if (!row) return;

  const student = students.find((item) => item.id === row.dataset.id);
  if (!student) return;

  document.querySelectorAll("tbody tr").forEach((item) => item.classList.remove("selected"));
  row.classList.add("selected");
  setFormMode(student);
  showMessage("Aluno selecionado para edicao.");
});

async function deleteStudent(id) {
  const student = students.find((item) => item.id === id);
  if (!student) return;

  const shouldDelete = window.confirm(`Excluir o aluno ${student.nome}?`);
  if (!shouldDelete) return;

  showMessage("Excluindo aluno...");

  try {
    await requestJson(`/api/students/${id}`, { method: "DELETE" });

    if (fields.id.value === id) {
      setFormMode(null);
    }

    await loadStudents();
    showMessage("Aluno excluido com sucesso.");
  } catch (error) {
    showMessage(error.message, true);
  }
}

clearButton.addEventListener("click", () => {
  setFormMode(null);
  showMessage("");
});

fields.cep.addEventListener("input", () => {
  const previousCep = lastResolvedCep;
  fields.cep.value = formatCep(fields.cep.value);
  const currentCep = onlyDigits(fields.cep.value);

  if (currentCep !== previousCep) {
    lastResolvedCep = "";
  }

  if (currentCep.length < 8) {
    setAddressReadonly(false);
  }
});

fields.cep.addEventListener("blur", lookupCep);

sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.sortKey;
    const direction =
      activeSort.key === key && activeSort.direction === "desc" ? "asc" : "desc";

    activeSort = { key, direction };
    renderStudents();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formValidationMessage = validateFormBeforeSubmit();
  if (formValidationMessage) {
    showMessage(formValidationMessage, true);
    return;
  }

  const cepOk = await lookupCep();
  if (!cepOk) {
    return;
  }

  const selectedId = fields.id.value;
  const payload = payloadFromForm();
  const url = selectedId ? `/api/students/${selectedId}` : "/api/students";
  const method = selectedId ? "PUT" : "POST";

  submitButton.disabled = true;
  showMessage(selectedId ? "Salvando alteracoes..." : "Cadastrando aluno...");

  try {
    await requestJson(url, {
      method,
      body: JSON.stringify(payload),
    });

    await loadStudents();
    setFormMode(null);
    showMessage(selectedId ? "Aluno atualizado com sucesso." : "Aluno cadastrado com sucesso.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

fields.dataNascimento.max = toLocalInputDate();
loadStudents();
