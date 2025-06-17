// Abrir el modal y rellenar los datos de la maceta
$('#setHumedadModal').on('show.bs.modal', function (event) {
  const button = $(event.relatedTarget); // Botón que abrió el modal
  const zona = button.data('zona'); // Zona de la maceta
  const id = button.data('id'); // ID de la maceta

  // Rellenar los campos en el modal
  $('#macetaZona').val(zona);

  // Al enviar el formulario de humedad
  $('#humedadForm').on('submit', function (e) {
    e.preventDefault();
    const humedad = $('#humedad').val(); // Obtener el valor de humedad

    // Realizar la petición AJAX para actualizar el valor en la base de datos
    $.ajax({
      url: '/actualizar-humedad',  // Ruta que crearás en Express
      method: 'POST',
      data: {
        id: id, // ID de la maceta
        humedad: humedad, // Nivel de humedad
      },
      success: function(response) {
        alert('Humedad actualizada con éxito');
        $('#setHumedadModal').modal('hide'); // Cerrar modal
        location.reload(); // Recargar la página para ver los cambios
      },
      error: function(err) {
        alert('Error al actualizar humedad');
      }
    });
  });
});
