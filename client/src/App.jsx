import { useEffect, useMemo, useRef, useState } from "react";

const emptyStudent = {
  id: "",
  codigo: "",
  nome: "",
  dataNascimento: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
};

const emptyReadonlyAddress = {
  logradouro: false,
  bairro: false,
  cidade: false,
  estado: false,
};

const sortLabels = {
  codigo: "codigo",
  dataNascimento: "data de nascimento",
  dataCadastro: "data de cadastro",
  ultimoUpdate: "ultimo update",
};

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCep(value) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toLocalInputDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function getAddressLines(address = {}) {
  const lineOne = [address.logradouro, address.numero].filter(Boolean).join(", ");
  const lineTwo = [address.complemento, address.bairro].filter(Boolean).join(" - ");
  const lineThree = [address.cidade, address.estado, address.cep].filter(Boolean).join(" / ");

  return [lineOne, lineTwo, lineThree].filter(Boolean);
}

function getSortValue(student, key) {
  if (key === "codigo") {
    return Number(student.codigo || 0);
  }

  return new Date(student[key]).getTime() || 0;
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

export default function App() {
  const formSectionRef = useRef(null);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(emptyStudent);
  const [statusOnline, setStatusOnline] = useState(false);
  const [message, setMessage] = useState({ text: "", error: false });
  const [submitting, setSubmitting] = useState(false);
  const [lastResolvedCep, setLastResolvedCep] = useState("");
  const [readonlyAddress, setReadonlyAddress] = useState(emptyReadonlyAddress);
  const [activeSort, setActiveSort] = useState({ key: null, direction: null });
  const [searchTerm, setSearchTerm] = useState("");
  const [formHeight, setFormHeight] = useState(null);

  const selectedId = form.id;
  const today = useMemo(() => toLocalInputDate(), []);

  const filteredStudents = useMemo(() => {
    const query = normalizeText(searchTerm).trim();

    if (!query) {
      return students;
    }

    return students.filter((student) => normalizeText(student.nome).includes(query));
  }, [searchTerm, students]);

  const visibleStudents = useMemo(() => {
    if (!activeSort.key || !activeSort.direction) {
      return filteredStudents;
    }

    return [...filteredStudents].sort((first, second) => {
      const comparison = getSortValue(first, activeSort.key) - getSortValue(second, activeSort.key);
      return activeSort.direction === "asc" ? comparison : -comparison;
    });
  }, [activeSort, filteredStudents]);

  useEffect(() => {
    loadStudents();
  }, []);

  useEffect(() => {
    const element = formSectionRef.current;
    if (!element) return undefined;

    const observer = new ResizeObserver(() => {
      setFormHeight(element.getBoundingClientRect().height);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function showMessage(text, error = false) {
    setMessage({ text, error });
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function loadStudents() {
    try {
      const data = await requestJson("/api/students");
      setStudents(data);
      setStatusOnline(true);
    } catch (error) {
      setStatusOnline(false);
      showMessage(error.message, true);
    }
  }

  function clearForm() {
    setForm(emptyStudent);
    setLastResolvedCep("");
    setReadonlyAddress(emptyReadonlyAddress);
    showMessage("");
  }

  function selectStudent(student) {
    const cep = formatCep(student.endereco?.cep || "");

    setForm({
      id: student.id,
      codigo: student.codigo,
      nome: student.nome || "",
      dataNascimento: toInputDate(student.dataNascimento),
      cep,
      logradouro: student.endereco?.logradouro || "",
      numero: student.endereco?.numero || "",
      complemento: student.endereco?.complemento || "",
      bairro: student.endereco?.bairro || "",
      cidade: student.endereco?.cidade || "",
      estado: student.endereco?.estado || "",
    });
    setLastResolvedCep(onlyDigits(cep));
    setReadonlyAddress({
      logradouro: Boolean(student.endereco?.logradouro),
      bairro: Boolean(student.endereco?.bairro),
      cidade: Boolean(student.endereco?.cidade),
      estado: Boolean(student.endereco?.estado),
    });
    showMessage("Aluno selecionado para edicao.");
  }

  function payloadFromForm(source = form) {
    return {
      nome: source.nome.trim(),
      dataNascimento: source.dataNascimento,
      endereco: {
        cep: formatCep(source.cep),
        logradouro: source.logradouro.trim(),
        numero: source.numero.trim(),
        complemento: source.complemento.trim(),
        bairro: source.bairro.trim(),
        cidade: source.cidade.trim(),
        estado: source.estado.trim().toUpperCase(),
      },
    };
  }

  function validateFormBeforeSubmit() {
    if (!isRealInputDate(form.dataNascimento)) {
      return "Informe uma data de nascimento valida.";
    }

    if (form.dataNascimento < "1900-01-01" || form.dataNascimento > today) {
      return "A data de nascimento deve estar entre 01/01/1900 e hoje.";
    }

    if (onlyDigits(form.cep).length !== 8) {
      return "Informe um CEP valido com 8 digitos.";
    }

    return null;
  }

  async function lookupCep() {
    const cep = onlyDigits(form.cep);
    setForm((current) => ({ ...current, cep: formatCep(cep) }));

    if (!cep) {
      setLastResolvedCep("");
      setReadonlyAddress(emptyReadonlyAddress);
      return { ...form, cep: "" };
    }

    if (cep === lastResolvedCep) {
      return form;
    }

    if (cep.length !== 8) {
      setLastResolvedCep("");
      setReadonlyAddress(emptyReadonlyAddress);
      showMessage("Informe um CEP com 8 digitos.", true);
      return null;
    }

    showMessage("Buscando endereco pelo CEP...");

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const address = await response.json();

      if (!response.ok || address.erro) {
        setLastResolvedCep("");
        setReadonlyAddress(emptyReadonlyAddress);
        showMessage("CEP nao encontrado. Preencha o endereco manualmente.", true);
        return null;
      }

      const nextForm = {
        ...form,
        cep: formatCep(cep),
        logradouro: address.logradouro || "",
        bairro: address.bairro || "",
        cidade: address.localidade || "",
        estado: address.uf || "",
      };

      setForm(nextForm);
      setLastResolvedCep(cep);
      setReadonlyAddress({
        logradouro: Boolean(address.logradouro),
        bairro: Boolean(address.bairro),
        cidade: Boolean(address.localidade),
        estado: Boolean(address.uf),
      });
      showMessage("Endereco preenchido pelo CEP.");
      return nextForm;
    } catch (error) {
      setLastResolvedCep("");
      setReadonlyAddress(emptyReadonlyAddress);
      showMessage("Nao foi possivel consultar o CEP agora.", true);
      return null;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validationMessage = validateFormBeforeSubmit();
    if (validationMessage) {
      showMessage(validationMessage, true);
      return;
    }

    const checkedForm = await lookupCep();
    if (!checkedForm) return;

    const url = selectedId ? `/api/students/${selectedId}` : "/api/students";
    const method = selectedId ? "PUT" : "POST";

    setSubmitting(true);
    showMessage(selectedId ? "Salvando alteracoes..." : "Cadastrando aluno...");

    try {
      await requestJson(url, {
        method,
        body: JSON.stringify(payloadFromForm(checkedForm)),
      });

      await loadStudents();
      clearForm();
      showMessage(selectedId ? "Aluno atualizado com sucesso." : "Aluno cadastrado com sucesso.");
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteStudent(student) {
    const shouldDelete = window.confirm(`Excluir o aluno ${student.nome}?`);
    if (!shouldDelete) return;

    showMessage("Excluindo aluno...");

    try {
      await requestJson(`/api/students/${student.id}`, { method: "DELETE" });

      if (selectedId === student.id) {
        clearForm();
      }

      await loadStudents();
      showMessage("Aluno excluido com sucesso.");
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  function handleCepChange(value) {
    const cep = formatCep(value);
    const digits = onlyDigits(cep);

    if (digits !== lastResolvedCep) {
      setLastResolvedCep("");
      setReadonlyAddress(emptyReadonlyAddress);
    }

    updateForm("cep", cep);
  }

  function toggleSort(key) {
    setActiveSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  }

  function sortIndicatorClass(key) {
    if (activeSort.key !== key) {
      return "sort-indicator";
    }

    return `sort-indicator ${activeSort.direction}`;
  }

  function sortLabel(key) {
    const direction =
      activeSort.key === key && activeSort.direction === "desc" ? "crescente" : "decrescente";

    return `Ordenar ${sortLabels[key]} em ordem ${direction}`;
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Fractal</p>
          <h1>Cadastro de Alunos</h1>
        </div>
        <div className={`status-pill ${statusOnline ? "online" : "offline"}`}>
          {statusOnline ? "MongoDB conectado" : "Sem conexao"}
        </div>
      </header>

      <main className="shell">
        <section className="form-section" aria-labelledby="form-title" ref={formSectionRef}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Formulario</p>
              <h2 id="form-title">{selectedId ? `Editando codigo ${form.codigo || ""}` : "Novo aluno"}</h2>
            </div>
            <button className="ghost-button" type="button" onClick={clearForm}>
              Limpar
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <label>
              Nome
              <input
                maxLength="120"
                required
                value={form.nome}
                onChange={(event) => updateForm("nome", event.target.value)}
              />
            </label>

            <label>
              Data de nascimento
              <input
                type="date"
                min="1900-01-01"
                max={today}
                required
                value={form.dataNascimento}
                onChange={(event) => updateForm("dataNascimento", event.target.value)}
              />
            </label>

            <fieldset>
              <legend>Endereco completo</legend>

              <div className="field-grid">
                <label>
                  CEP
                  <input
                    maxLength="9"
                    required
                    value={form.cep}
                    onBlur={lookupCep}
                    onChange={(event) => handleCepChange(event.target.value)}
                  />
                </label>
                <label>
                  Estado
                  <input
                    className={readonlyAddress.estado ? "readonly" : ""}
                    maxLength="2"
                    readOnly={readonlyAddress.estado}
                    required
                    value={form.estado}
                    onChange={(event) => updateForm("estado", event.target.value.toUpperCase())}
                  />
                </label>
              </div>

              <label>
                Logradouro
                <input
                  className={readonlyAddress.logradouro ? "readonly" : ""}
                  maxLength="120"
                  readOnly={readonlyAddress.logradouro}
                  required
                  value={form.logradouro}
                  onChange={(event) => updateForm("logradouro", event.target.value)}
                />
              </label>

              <div className="field-grid">
                <label>
                  Numero
                  <input
                    maxLength="20"
                    required
                    value={form.numero}
                    onChange={(event) => updateForm("numero", event.target.value)}
                  />
                </label>
                <label>
                  Complemento
                  <input
                    maxLength="80"
                    value={form.complemento}
                    onChange={(event) => updateForm("complemento", event.target.value)}
                  />
                </label>
              </div>

              <div className="field-grid">
                <label>
                  Bairro
                  <input
                    className={readonlyAddress.bairro ? "readonly" : ""}
                    maxLength="80"
                    readOnly={readonlyAddress.bairro}
                    required
                    value={form.bairro}
                    onChange={(event) => updateForm("bairro", event.target.value)}
                  />
                </label>
                <label>
                  Cidade
                  <input
                    className={readonlyAddress.cidade ? "readonly" : ""}
                    maxLength="80"
                    readOnly={readonlyAddress.cidade}
                    required
                    value={form.cidade}
                    onChange={(event) => updateForm("cidade", event.target.value)}
                  />
                </label>
              </div>
            </fieldset>

            <button className="primary-button" type="submit" disabled={submitting}>
              {selectedId ? "Salvar edicao" : "Cadastrar aluno"}
            </button>
          </form>
        </section>

        <section
          className="grid-section"
          aria-labelledby="grid-title"
          style={formHeight ? { "--grid-panel-height": `${formHeight}px` } : undefined}
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Grid</p>
              <h2 id="grid-title">Alunos cadastrados</h2>
            </div>
            <div className="grid-actions">
              <label className="search-field">
                <span className="sr-only">Pesquisar alunos por nome</span>
                <input
                  aria-label="Pesquisar alunos por nome"
                  placeholder="Pesquisar por nome"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
              <span className="count">
                {visibleStudents.length} registro{visibleStudents.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {message.text && (
            <div className={`message show ${message.error ? "error" : ""}`} role="status">
              {message.text}
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortableHeader
                    label="Codigo"
                    sortKey="codigo"
                    ariaLabel={sortLabel("codigo")}
                    indicatorClass={sortIndicatorClass("codigo")}
                    onSort={toggleSort}
                  />
                  <HeaderCell label="Nome" />
                  <SortableHeader
                    label="Nascimento"
                    sortKey="dataNascimento"
                    ariaLabel={sortLabel("dataNascimento")}
                    indicatorClass={sortIndicatorClass("dataNascimento")}
                    onSort={toggleSort}
                  />
                  <HeaderCell label="Endereco" />
                  <SortableHeader
                    label="Data cadastro"
                    sortKey="dataCadastro"
                    ariaLabel={sortLabel("dataCadastro")}
                    indicatorClass={sortIndicatorClass("dataCadastro")}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Ultimo update"
                    sortKey="ultimoUpdate"
                    ariaLabel={sortLabel("ultimoUpdate")}
                    indicatorClass={sortIndicatorClass("ultimoUpdate")}
                    onSort={toggleSort}
                  />
                  <HeaderCell label="Acoes" />
                </tr>
              </thead>
              <tbody>
                {visibleStudents.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty">
                      {searchTerm ? "Nenhum aluno encontrado." : "Nenhum aluno cadastrado."}
                    </td>
                  </tr>
                ) : (
                  visibleStudents.map((student) => (
                    <tr
                      className={student.id === selectedId ? "selected" : ""}
                      key={student.id}
                      onClick={() => selectStudent(student)}
                    >
                      <td className="code-cell">{student.codigo}</td>
                      <td>{student.nome}</td>
                      <td>{formatDate(student.dataNascimento)}</td>
                      <td className="address-cell">
                        {getAddressLines(student.endereco).map((line) => (
                          <span key={line}>
                            {line}
                            <br />
                          </span>
                        ))}
                      </td>
                      <td>{formatDateTime(student.dataCadastro)}</td>
                      <td>{formatDateTime(student.ultimoUpdate)}</td>
                      <td>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteStudent(student);
                          }}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

function SortableHeader({ label, sortKey, ariaLabel, indicatorClass, onSort }) {
  return (
    <th>
      <button
        className="sort-button"
        type="button"
        aria-label={ariaLabel}
        onClick={() => onSort(sortKey)}
      >
        {label} <span className={indicatorClass}></span>
      </button>
    </th>
  );
}

function HeaderCell({ label }) {
  return (
    <th>
      <span className="th-label">
        {label} <span className="sort-spacer"></span>
      </span>
    </th>
  );
}
