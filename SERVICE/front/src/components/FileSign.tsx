import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiFile } from "react-icons/fi";
import { UserCredential } from "../App";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Cookies from "js-cookie";

interface FileSignProps {
  userCredential: UserCredential | undefined;
  globalPublicKey: string | undefined;
}

interface User {
  username: string;
  user_pass: string;
}

interface hash {
  name: string;
  hash: string;
  es_compartido: number;
}

export const FileSign = ({
  userCredential,
  globalPublicKey,
}: FileSignProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!userCredential || !("id" in userCredential!)) {
      navigate("/");
    }
  }, [userCredential, navigate]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [hashes, setHashes] = useState<hash[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [publicKey, setPublicKey] = useState("");
  const [users, setUsers] = useState<User[]>([]);

  const [showOverlay, setShowOverlay] = useState(false); // Estado para controlar el div

  const handleButtonClick = () => {
    setShowOverlay(true); // Mostrar el div al hacer clic
  };

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch("http://localhost:4000/api/users");
        const data = await response.json();

        setUsers(data.usuarios);
      } catch (error) {
        console.error("Error al cargar los archivos:", error);
      }
    };

    fetchUsers();
  }, []);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const alias = userCredential?.id;
        const response = await fetch("http://localhost:4000/api/archivos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json", // Asegura que el servidor sepa que estás enviando JSON.
          },
          body: JSON.stringify({
            alias, // Asegúrate de que este valor no sea `undefined` o `null`.
          }),
        });
        const data = await response.json();

        setHashes(
          data.archivos.map((file: any) => {
            return {
              name: file.nombre_archivo,
              hash: file.hash,
              es_compartido: file.es_compartido,
            };
          })
        );

        const loadedFiles = data.archivos.map((file: any) => {
          const blob = new Blob(
            [
              new Uint8Array(
                atob(file.contenido)
                  .split("")
                  .map((c) => c.charCodeAt(0))
              ),
            ],
            { type: file.tipo_contenido }
          );
          return new File([blob], file.nombre_archivo, {
            type: file.tipo_contenido,
          });
        });

        setFiles(loadedFiles);
      } catch (error) {
        console.error("Error al cargar los archivos:", error);
      }
    };

    fetchFiles();
  }, []);

  const refreshAccessToken = async () => {
    const refreshToken = Cookies.get("refreshToken");
    const response = await fetch("http://localhost:4000/api/refresh-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await response.json();
    if (data.accessToken) {
      // Guardar el nuevo access token
      Cookies.set("accessToken", data.accessToken, { expires: 1 / 24 });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const file = event.target.files[0];
      setFiles([...files, ...Array.from(event.target.files)]);
      setHashes([...hashes, { name: file.name, hash: "", es_compartido: 0 }]);
    }
  };

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
  };

  useEffect(() => {
    if (selectedIndex !== null) {
      const filter = hashes.find(
        (hash) => hash.name === files[selectedIndex].name
      );
      setSelectedHash(filter?.hash!);
    }
  }, [selectedIndex]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const generateHash = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  };

  const saveFile = async () => {
    if (selectedIndex !== null) {
      const fileToSave = files[selectedIndex];
      const fileHash = await generateHash(fileToSave);
      setSelectedHash(fileHash); // Guardar el hash seleccionado

      const reader = new FileReader();
      reader.onload = async function (event) {
        if (event.target && event.target.result) {
          const id = userCredential?.id;
          const byteArray = new Uint8Array(event.target.result as ArrayBuffer);
          const formData = new FormData();
          formData.append("nombre_archivo", fileToSave.name);
          formData.append("tamano", fileToSave.size.toString());
          formData.append("tipo_contenido", fileToSave.type);
          formData.append("archivo", new Blob([byteArray]));
          formData.append("hash_archivo", fileHash); // Adjuntar el hash al FormData
          formData.append("alias", id!); // Adjuntar el hash al FormData

          try {
            const response = await fetch("http://localhost:4000/api/upload", {
              method: "POST",
              body: formData,
            });
            const data = await response.json();
            toast.success(data.message);
          } catch (error) {
            console.error("Error al firmar el archivo:", error);
          }
        }
      };

      reader.readAsArrayBuffer(fileToSave);
    }
  };

  const handleDownloadFile = () => {
    handleDownloadFile();
    if (selectedIndex !== null) {
      const fileToDownload = files[selectedIndex];
      const url = URL.createObjectURL(fileToDownload);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileToDownload.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const fetchPrivateKey = async () => {
    return new Promise<string>((resolve, reject) => {
      // Crear un elemento de entrada para archivos
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pem"; // Aceptar solo archivos .pem

      // Evento que se activa cuando se selecciona un archivo
      input.onchange = (event) => {
        const target = event.target as HTMLInputElement; // Afirmación de tipo
        if (target && target.files && target.files.length > 0) {
          const file = target.files[0]; // Obtener el primer archivo seleccionado
          const reader = new FileReader();

          // Evento que se activa cuando se ha leído el archivo
          reader.onload = (e) => {
            const content = e.target?.result as string; // Obtener el contenido del archivo
            resolve(content); // Retornar el contenido del archivo
          };

          // Manejar errores al leer el archivo
          reader.onerror = () => {
            reject(new Error("Error al leer el archivo."));
          };

          // Leer el archivo como texto
          reader.readAsText(file);
        } else {
          reject(new Error("No se seleccionó ningún archivo."));
        }
      };

      // Abrir el explorador de archivos
      input.click();
    });
  };

  const handleSignFile = async () => {
    if (selectedHash) {
      // Usar esta función antes de hacer cualquier solicitud protegida
      const accessToken = Cookies.get("accessToken");

      if (!accessToken) {
        await refreshAccessToken();
      }

      if (!globalPublicKey) {
        toast.error("Genere una llave pública antes de firmar");
        return;
      }
      try {
        let privateKey = await fetchPrivateKey(); // Obtener la clave privada
        const response = await fetch("http://localhost:4000/api/sign", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`, // Token JWT
          },
          body: JSON.stringify({
            hash: selectedHash,
            privateKey,
            alias: userCredential?.id,
            nombre_archivo: files[selectedIndex!].name,
          }),
        });

        const result = await response.json();
        toast.success(result.message);
      } catch (error) {
        console.error("Error al firmar el archivo:", error);
      }
    } else {
      console.log("No se ha seleccionado ningún hash."); // Mensaje adicional
    }
  };

  const handleVerifyFile = async () => {
    // Usar esta función antes de hacer cualquier solicitud protegida
    const accessToken = Cookies.get("accessToken");

    if (!accessToken) {
      await refreshAccessToken();
    }

    if (selectedHash) {
      try {
        const response = await fetch("http://localhost:4000/api/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`, // Token JWT
          },
          body: JSON.stringify({
            hash: selectedHash,
            publicKey,
            nombre_archivo: files[selectedIndex!].name,
            alias: userCredential?.id,
          }),
        });
        const result = await response.json();
        if (result.message === "Hash o clave pública no proporcionados.") {
          toast.warning(result.message);
        }
        if (result.message === "Firma no válida") {
          toast.error(result.message);
        }
        if (result.message === "Llave pública no válida") {
          toast.error(result.message);
        }
        if (result.message === "Firma verificada con éxito") {
          toast.success(result.message);
        }
      } catch (error) {
        toast.error("Error al verificar el archivo:");
        console.error("Error al verificar el archivo", error);
      }
    }
  };

  const handleCompartirArchivo = async (username: string) => {
    if (!globalPublicKey) {
      toast.error("Genere una llave pública antes de compartir");
      return;
    }
    if (selectedIndex !== null) {
      const fileToSave = files[selectedIndex];
      const fileHash = await generateHash(fileToSave);
      setSelectedHash(fileHash); // Guardar el hash seleccionado

      const reader = new FileReader();
      reader.onload = async function (event) {
        if (event.target && event.target.result) {
          const id = userCredential?.id;
          const byteArray = new Uint8Array(event.target.result as ArrayBuffer);
          const formData = new FormData();
          formData.append("nombre_archivo", fileToSave.name);
          formData.append("tamano", fileToSave.size.toString());
          formData.append("tipo_contenido", fileToSave.type);
          formData.append("archivo", new Blob([byteArray]));
          formData.append("hash_archivo", fileHash); // Adjuntar el hash al FormData
          formData.append("alias", username); // Adjuntar el hash al FormData
          formData.append("usuario_comparte", id!); // Adjuntar el hash al FormData

          if (globalPublicKey) {
            formData.append("llave_usuario_comparte", globalPublicKey); // Adjuntar el hash al FormData
          }

          try {
            const response = await fetch("http://localhost:4000/api/share", {
              method: "POST",
              body: formData,
            });
            const data = await response.json();
            toast.success(data.message);
          } catch (error) {
            console.error("Error al firmar el archivo:", error);
          }
        }
      };

      reader.readAsArrayBuffer(fileToSave);
    }
  };
  const processedFiles = new Set();
  return (
    <div>
      <div className="bg-white text-black">
        <nav className="p-3 shadow-md border-b border-gray-600 flex items-center justify-between">
          <h1 className="font-bold text-2xl">
            Diplomado Infraestructura{" "}
            <span className="text-indigo-600">Firma Digital</span>
          </h1>
          <div className="flex gap-3 font-semibold text-lg">
            <Link
              className="hover:text-indigo-600 transition-colors"
              to={"/mis-compartidos"}
            >
              Mis compartidos
            </Link>
            <Link
              className="hover:text-indigo-600 transition-colors"
              to={"/file-sign"}
            >
              Mis archivos
            </Link>
            <Link
              className="hover:text-indigo-600 transition-colors"
              to={"/generate"}
            >
              Generar llaves
            </Link>
          </div>
        </nav>
      </div>
      <section className="w-full mt-10">
        <div>
          <h2 className="text-center mb-5 text-xl font-semibold">
            Mis Archivos
          </h2>
          <div className="flex gap-5 mx-auto w-1/2 justify-center">
            {files.map((file, index) => {
              const found = hashes.find(
                (item) => item.name === file.name && item.es_compartido === 0
              );

              // Si ya procesamos este archivo, lo saltamos
              if (found && !processedFiles.has(file.name)) {
                processedFiles.add(file.name); // Marcamos el archivo como procesado
                return (
                  <div
                    key={index}
                    className={`cursor-pointer transition-colors size-24 rounded-lg p-5 text-center ${
                      selectedIndex === index
                        ? "bg-indigo-700"
                        : "bg-indigo-400 hover:bg-indigo-700"
                    }`}
                    onClick={() => handleSelect(index)}
                  >
                    <FiFile size={40} className="mx-auto text-white" />
                    <p className="text-white mt-2 text-xs truncate">
                      {file.name}
                    </p>
                  </div>
                );
              }

              // Si no cumple con las condiciones o ya fue procesado, no renderizamos nada
              return null;
            })}
          </div>
        </div>
        <div className="flex mt-20 justify-between w-full mx-auto">
          <button
            className="p-2 bg-indigo-700 rounded-md text-white mx-auto block mt-5 px-5 font-semibold transition-all ease-linear hover:bg-indigo-500"
            onClick={handleUploadClick}
          >
            Cargar archivo
          </button>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            className={`p-2 bg-indigo-700 rounded-md text-white mx-auto block mt-5 px-5 font-semibold transition-all ease-linear hover:bg-indigo-500 ${
              selectedIndex === null && "opacity-30"
            }`}
            onClick={saveFile}
            disabled={selectedIndex === null}
          >
            Guardar archivo
          </button>
          <div className="relative">
            <button
              className={`p-2 bg-yellow-600 rounded-md text-white mx-auto block mt-5 px-5 font-semibold transition-all ease-linear hover:bg-yellow-700 ${
                selectedIndex === null && "opacity-30"
              }`}
              onClick={handleButtonClick}
              disabled={selectedIndex === null}
            >
              Compartir archivo
            </button>

            {showOverlay && (
              <div className="absolute -top-28 left-0 w-96 h-full bg-white bg-opacity-90 flex items-center justify-center z-50">
                <div className="p-5 bg-white shadow-lg rounded-lg w-full">
                  <div className="bg-gray-100 rounded-lg">
                    {users.length > 0 &&
                      users.map((user, index) => {
                        if (user.username !== userCredential?.id) {
                          return (
                            <div
                              className="bg-gray-100 p-2 px-3 hover:bg-gray-200 rounded-lg flex items-center justify-between"
                              key={index}
                            >
                              <p>{user.username}</p>
                              <button
                                onClick={() =>
                                  handleCompartirArchivo(user.username)
                                }
                                className="text-blue-500 font-semibold"
                              >
                                Compartir
                              </button>
                            </div>
                          );
                        }
                      })}
                  </div>
                  <button
                    className="mt-3 p-2 bg-gray-800 text-white rounded-md"
                    onClick={() => setShowOverlay(false)} // Cerrar el div
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
          {/*           <button
            className={`p-2 bg-sky-600 rounded-md text-white mx-auto block mt-5 px-5 font-semibold transition-all ease-linear hover:bg-sky-500 ${
              selectedIndex === null && "opacity-30"
            }`}
            onClick={handleDownloadFile}
            disabled={selectedIndex === null}
          >
            Descargar archivo
          </button> */}
          <button
            className={`p-2 bg-pink-700 rounded-md text-white mx-auto block mt-5 px-5 font-semibold transition-all ease-linear hover:bg-pink-600 ${
              selectedIndex === null && "opacity-30"
            }`}
            onClick={handleSignFile}
            disabled={selectedIndex === null}
          >
            Firmar archivo
          </button>
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-center text-xl font-semibold">
          Llave pública para verificación:
        </h2>
        <textarea
          className="border-2 rounded-md mx-auto block w-[700px] h-40 mt-5 resize-none text-black"
          name="public_key"
          id="public_key"
          onChange={(e) => setPublicKey(e.target.value)}
          value={publicKey}
        />
        <button
          className={`p-2 bg-slate-800 rounded-md disabled:opacity-25 text-white mx-auto block mt-5 px-5 font-semibold transition-all ease-linear hover:bg-slate-700 ${
            selectedIndex === null && "opacity-30"
          }`}
          onClick={handleVerifyFile}
          disabled={selectedIndex === null || publicKey === ""}
        >
          Verificar archivo
        </button>
      </section>
      <ToastContainer pauseOnHover={false} />
    </div>
  );
};
