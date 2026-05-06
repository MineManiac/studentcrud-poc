const path = require("path");

const dotenv = require("dotenv");
const express = require("express");
const mongoose = require("mongoose");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/studentcrud";
const validBrazilStates = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
]);

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const addressSchema = new mongoose.Schema(
  {
    cep: { type: String, trim: true, maxlength: 12 },
    logradouro: { type: String, trim: true, maxlength: 120 },
    numero: { type: String, trim: true, maxlength: 20 },
    complemento: { type: String, trim: true, maxlength: 80 },
    bairro: { type: String, trim: true, maxlength: 80 },
    cidade: { type: String, trim: true, maxlength: 80 },
    estado: { type: String, trim: true, uppercase: true, minlength: 2, maxlength: 2 },
  },
  { _id: false }
);

const studentSchema = new mongoose.Schema(
  {
    codigo: { type: Number, unique: true, index: true, immutable: true },
    nome: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    dataNascimento: { type: Date, required: true },
    endereco: { type: addressSchema, required: true },
  },
  {
    timestamps: { createdAt: "dataCadastro", updatedAt: "ultimoUpdate" },
    versionKey: false,
  }
);

const Counter = mongoose.model("Counter", counterSchema);
const Student = mongoose.model("Student", studentSchema);

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCep(value) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function normalizeComparable(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function parseBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseStudentPayload(body) {
  return {
    nome: String(body.nome || "").trim(),
    dataNascimento: body.dataNascimento,
    endereco: {
      cep: formatCep(body.endereco?.cep),
      logradouro: String(body.endereco?.logradouro || "").trim(),
      numero: String(body.endereco?.numero || "").trim(),
      complemento: String(body.endereco?.complemento || "").trim(),
      bairro: String(body.endereco?.bairro || "").trim(),
      cidade: String(body.endereco?.cidade || "").trim(),
      estado: String(body.endereco?.estado || "").trim().toUpperCase(),
    },
  };
}

async function getAddressFromCep(cep) {
  const response = await fetch(`https://viacep.com.br/ws/${onlyDigits(cep)}/json/`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function validateAddressCompatibility(studentAddress, cepAddress) {
  const checks = [
    ["estado", studentAddress.estado, cepAddress.uf],
    ["cidade", studentAddress.cidade, cepAddress.localidade],
    ["bairro", studentAddress.bairro, cepAddress.bairro],
    ["logradouro", studentAddress.logradouro, cepAddress.logradouro],
  ];

  const mismatch = checks.find(([, informed, expected]) => {
    return expected && normalizeComparable(informed) !== normalizeComparable(expected);
  });

  if (mismatch) {
    return `O ${mismatch[0]} informado nao corresponde ao CEP.`;
  }

  return null;
}

async function validateStudentPayload(student) {
  const requiredFields = [
    ["nome", student.nome],
    ["data de nascimento", student.dataNascimento],
    ["CEP", student.endereco.cep],
    ["logradouro", student.endereco.logradouro],
    ["numero", student.endereco.numero],
    ["bairro", student.endereco.bairro],
    ["cidade", student.endereco.cidade],
    ["estado", student.endereco.estado],
  ];

  const missing = requiredFields.filter(([, value]) => !String(value || "").trim());

  if (missing.length > 0) {
    return `Preencha: ${missing.map(([label]) => label).join(", ")}.`;
  }

  if (!/^[A-Za-z]{2}$/.test(student.endereco.estado)) {
    return "Informe o estado com a sigla de 2 letras.";
  }

  if (!validBrazilStates.has(student.endereco.estado)) {
    return "Informe uma sigla de estado valida do Brasil.";
  }

  const birthDate = parseBirthDate(student.dataNascimento);
  if (!birthDate) {
    return "Informe a data de nascimento no formato AAAA-MM-DD e com uma data real.";
  }

  const minBirthDate = new Date(Date.UTC(1900, 0, 1));
  if (birthDate < minBirthDate || birthDate > todayUtc()) {
    return "A data de nascimento deve estar entre 01/01/1900 e hoje.";
  }

  const cepDigits = onlyDigits(student.endereco.cep);
  if (cepDigits.length !== 8) {
    return "Informe um CEP valido com 8 digitos.";
  }

  let cepAddress;
  try {
    cepAddress = await getAddressFromCep(student.endereco.cep);
  } catch (error) {
    return "Nao foi possivel validar o CEP agora. Tente novamente em instantes.";
  }

  if (!cepAddress || cepAddress.erro) {
    return "CEP nao encontrado.";
  }

  const compatibilityMessage = validateAddressCompatibility(student.endereco, cepAddress);
  if (compatibilityMessage) {
    return compatibilityMessage;
  }

  student.dataNascimento = birthDate;
  student.endereco.cep = formatCep(student.endereco.cep);
  student.endereco.estado = student.endereco.estado.toUpperCase();

  return null;
}

async function getNextStudentCode() {
  const counter = await Counter.findByIdAndUpdate(
    "studentCode",
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return counter.seq;
}

function toStudentView(student) {
  return {
    id: student._id,
    codigo: student.codigo,
    nome: student.nome,
    dataNascimento: student.dataNascimento,
    endereco: student.endereco,
    dataCadastro: student.dataCadastro,
    ultimoUpdate: student.ultimoUpdate,
  };
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/students", async (req, res, next) => {
  try {
    const students = await Student.find().sort({ dataCadastro: -1, _id: -1 });
    res.json(students.map(toStudentView));
  } catch (error) {
    next(error);
  }
});

app.post("/api/students", async (req, res, next) => {
  try {
    const payload = parseStudentPayload(req.body);
    const validationMessage = await validateStudentPayload(payload);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const student = await Student.create({
      ...payload,
      codigo: await getNextStudentCode(),
    });

    res.status(201).json(toStudentView(student));
  } catch (error) {
    next(error);
  }
});

app.put("/api/students/:id", async (req, res, next) => {
  try {
    const payload = parseStudentPayload(req.body);
    const validationMessage = await validateStudentPayload(payload);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const student = await Student.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!student) {
      return res.status(404).json({ message: "Aluno nao encontrado." });
    }

    res.json(toStudentView(student));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/students/:id", async (req, res, next) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);

    if (!student) {
      return res.status(404).json({ message: "Aluno nao encontrado." });
    }

    res.json({ message: "Aluno excluido com sucesso." });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({ message: "Erro interno no servidor." });
});

async function start() {
  await mongoose.connect(mongoUri);

  app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Nao foi possivel iniciar a aplicacao:", error.message);
  process.exit(1);
});
