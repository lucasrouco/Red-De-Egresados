import { Component, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { AuthService } from 'src/app/shared/services/auth.service';
import { FirestorageService } from 'src/app/shared/services/firestorage.service';
import { FirestoreService } from 'src/app/shared/services/firestore.service';
import { MiscService } from 'src/app/shared/services/misc.service';

@Component({
  selector: 'app-perfil-empresa',
  templateUrl: './perfil-empresa.component.html',
  styleUrls: ['./perfil-empresa.component.scss'],
})
export class PerfilEmpresaComponent implements OnInit {
  editarForm = new FormGroup({
    firstName: new FormControl('', [
      Validators.required,
      Validators.pattern('[a-zA-Z .]*'),
      Validators.minLength(2),
    ]),
    descripcion: new FormControl(''),
    lema: new FormControl('')
  });

  // Variables para controlar los patrones del formulario
  public firstNamePattern = this.editarForm.get('firstName');

  // Variable para guardar los datos del usuario
  public user: any;
  public uid;
  public userFirebase;

  // Variable para saber si se tiene que mostrar el formulario editable
  public mostrar: boolean = true;

  // Variables para la subida de fotos al Storage
  public nombreArchivo = '';
  public mensajeArchivo = 'No hay archivo seleccionado';
  public datosFormulario = new FormData();
  public URLPublica: string;
  public porcentaje = 0;
  public finalizado = false;

  // Variable para mostrar si hubo algun error en el formulario
  public errorMessage: any;

  // Se usa para saber si el usuario ofrece servicios o no.
  public ofreceServicio: boolean;

  public descripcion: string;

  constructor(
    private authSvc: AuthService,
    private miscSvc: MiscService,
    private firestorageSvc: FirestorageService,
    private firestoreSvc: FirestoreService
  ) {}

  async ngOnInit(): Promise<void> {
    let hayUnUsuario: string = await this.miscSvc.checkIfUserIsLogged();
    if (hayUnUsuario != 'empresa') {
      this.miscSvc.notAllowed(hayUnUsuario);
    } else {
      this.user = JSON.parse(localStorage.getItem('user'));
      this.userFirebase = JSON.parse(localStorage.getItem('userFirebase'));
      this.uid = localStorage.getItem('uid');
      this.getDescripcion();
    }
  }

  public getDescripcion() {
    this.descripcion = '';
    let inicial = true;
    let descripcionAux: string[] = this.user.descripcion;
    for (const word of descripcionAux) {
      if (inicial) {
        this.descripcion = word;
        inicial = false;
      } else {
        this.descripcion = this.descripcion + ' ' + word;
      }
    }
  }

  public cambioArchivo(event) {
    if (event.target.files.length > 0) {
      if (
        event.target.files[0].type == 'image/jpeg' ||
        event.target.files[0].type == 'image/jpg' ||
        event.target.files[0].type == 'image/png'
      ) {
        for (let i = 0; i < event.target.files.length; i++) {
          this.mensajeArchivo = `Archivo preparado: ${event.target.files[i].name}`;
          this.nombreArchivo = event.target.files[i].name;
          this.datosFormulario.delete('archivo');
          this.datosFormulario.append(
            'archivo',
            event.target.files[i],
            event.target.files[i].name
          );
        }
        console.log(this.datosFormulario.get('archivo'));
      } else {
        this.mensajeArchivo =
          'El formato del archivo no es valido (solo JPG, PNG o JPEG)';
      }
    } else {
      this.mensajeArchivo = 'No hay un archivo seleccionado';
    }
  }

  // Se usa para actualizar los datos del usuario propios de firebase
  async updateUserData(firstName, photoURL) {
    (await this.authSvc.afAuth.currentUser).updateProfile({
      displayName: firstName,
      photoURL: photoURL,
    });
  }

  public async editar() {
    if (this.mostrar) {
      this.mostrar = false;
    } else {
      this.mostrar = true;
      let hayUnUsuario: string = await this.miscSvc.checkIfUserIsLogged();
      if (hayUnUsuario == 'empresa') {
        this.user = JSON.parse(localStorage.getItem('user'));
        this.userFirebase = JSON.parse(localStorage.getItem('userFirebase'));
        this.uid = localStorage.getItem('uid');
      }
    }
  }

  async onEdit() {
    try {
      this.finalizado == false;
      // Verifica si el usuario metio un archivo para cambiar
      if (this.datosFormulario.get('archivo') != null) {
        // Se encarga de actualizar los datos del usuario, si entre esos datos hay una foto
        this.updateUserWithPhoto();
      } else {
        // Se encarga de actualizar los datos del usuario, si entre esos NO datos hay una foto
        this.updateUserWithoutPhoto();
      }
    } catch (error) {
      console.log(error);
    }
  }

  // Se encarga de actualizar los datos del usuario, si entre esos datos NO hay una foto
  async updateUserWithoutPhoto() {
    // Si no se ingresa una foto de perfil nueva, se agarra el link de la que ya estaba
    this.URLPublica = (await this.authSvc.afAuth.currentUser).photoURL;
    console.log(this.URLPublica);

    this.editEmpresa();
  }

  // Se encarga de actualizar los datos del usuario, si entre esos datos hay una foto
  updateUserWithPhoto() {
    let archivo = this.datosFormulario.get('archivo');
    const referencia = this.firestorageSvc.referenciaCloudStorage(
      this.nombreArchivo
    );
    const tarea = this.firestorageSvc.tareaCloudStorage(
      this.nombreArchivo,
      archivo
    );

    tarea.percentageChanges().subscribe(async (porcentaje) => {
      this.porcentaje = Math.round(porcentaje);
      if (this.porcentaje == 100 && this.finalizado == false) {
        this.finalizado = true;
        await referencia
          .getDownloadURL()
          .toPromise()
          .then((res) => {
            this.URLPublica = res;
          });
        /* referencia.getDownloadURL().subscribe((URL) => {
          this.URLPublica = URL;
        }); */
        this.editEmpresa();
      }
    });
  }

  async editEmpresa() {
    const user = await this.firestoreSvc.editEmpresa(
      this.user,
      this.editarForm.value,
      this.URLPublica
    );

    // Si el resultado de la operacion no es un string (osea que no devolvio un error)
    if (typeof user !== 'string') {
      //Se agarran los valores firstName y lastName del registerForm
      const { firstName } = this.editarForm.value;

      // Se actualiza los datos del usuario (estos son los propios de firebase)
      this.updateUserData(firstName, this.URLPublica);

      console.log(user);

      this.editar();
    } else {
      // Si user es un string, significa que hubo un error, por lo tanto se muestra
      this.errorMessage = user;
      console.log(user);
    }
  }
}
