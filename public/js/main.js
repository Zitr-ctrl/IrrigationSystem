fetch("https://jsonplaceholder.typicode.com/posts?")
  .then((response) => response.json())
  .then((data) => {
    const tabla = document.getElementById("datos-tabla");
    data.forEach((post) => {
      const fila = `
        <tr>
          <td>${post.id}</td>
          <td>${post.title}</td>
          <td>${post.body}</td>
        </tr>`;
      tabla.innerHTML += fila;
    });

    // Inicializar DataTables una vez cargados los datos
    $("#mi-tabla").DataTable({
      language: {
        url: '/js/i18n/es-ES.json'
      },
    });
  })
  .catch((error) => {
    console.error("Error al cargar los datos:", error);
    const tabla = document.getElementById("datos-tabla");
    tabla.innerHTML = '<tr><td colspan="3">Error al cargar los datos</td></tr>';
  });
