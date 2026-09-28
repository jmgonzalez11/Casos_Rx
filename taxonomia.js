'use strict';
/* =====================================================================
   Taxonomía por especialidad: órganos/regiones y subtemas.
   Cada entrada es [etiqueta, palabras clave]. Las palabras clave van en
   minúscula y sin tildes; las de 3 letras o menos se buscan como palabra
   completa. El clasificador busca primero las claves más largas y "tapa"
   el texto que ya usó (así «suprarrenal» no cuenta también como «renal»).
   ===================================================================== */

const KW_ONCO = ['tumor', 'neoplas', 'carcinoma', 'cancer', 'metasta', 'linfoma', 'sarcoma', 'adenocarcinoma', 'masa', 'nodul',
  'quiste', 'quistic', 'lesion focal', 'hemangioma', 'adenoma', 'mieloma', 'leucemia', 'gist', 'neuroendocrin', 'blastoma'];
const KW_INFL = ['itis', 'absceso', 'inflamat', 'infecc', 'tuberculo', 'empiema', 'flegmon', 'celulitis', 'sepsis', 'piogen', 'granulomat'];
const KW_TRAUMA = ['trauma', 'fractura', 'contusion', 'laceracion', 'politrauma', 'avulsion', 'luxacion', 'esguince'];
const KW_CONG = ['congenit', 'malformacion', 'displasia', 'agenesia', 'hipoplasia', 'variante anatomica', 'atresia', 'duplicacion', 'ectopi', 'heterotop'];
const KW_DEGEN = ['degenerativ', 'artrosis', 'espondilosis', 'discopatia', 'hernia del nucleo', 'protrusion discal', 'hernia discal', 'osteofit', 'canal estrecho', 'estenosis de canal', 'raquiestenosis'];
const KW_POSTOP = ['postop', 'post op', 'postquirurg', 'post quirurg', 'poscirug', 'postcirug', 'anastomo', 'dehiscencia', 'filtracion', 'fuga ', 'protesis',
  'osteosintesis', 'material quirurgico', 'trasplante', 'postratamiento', 'post tratamiento'];
const KW_TECN = ['tecnica', 'protocolo', 'secuencia', 'artefacto', 'medio de contraste', 'dosis', 'fisica', 'calidad de imagen', 'reaccion adversa'];
const KW_METAB = ['metabolic', 'deposito', 'gota', 'cppd', 'condrocalcinosis', 'osteoporosis', 'osteomalacia', 'hiperparatiroid', 'paget', 'amiloid', 'hemocromatosis', 'sobrecarga de hierro'];

const KW_HIGADO = ['higad', 'hepat', 'cirrosis', 'esteatosis', 'hemangioma', 'hnf', 'hiperplasia nodular', 'lirads', 'li-rads', 'budd', 'hemocromatosis',
  'hepatocarcinoma', 'chc', 'hcc', 'segmento hepat', 'lobulo caudado', 'hipertension portal', 'vena porta'];
const KW_BILIAR = ['biliar', 'coledoc', 'colangi', 'colecist', 'vesicul', 'klatskin', 'mirizzi', 'colelit', 'conducto hepatico', 'ampolla de vater', 'adenomiomatosis', 'barro biliar'];
const KW_PANCREAS = ['pancrea', 'wirsung', 'ipmn', 'tpmi', 'neoplasia quistica mucinosa', 'cistoadenoma seroso', 'insulinoma', 'ampul', 'periampul'];
const KW_BAZO = ['bazo', 'esplen', 'splen'];
const KW_SUPRARRENAL = ['suprarrenal', 'adrenal', 'feocromocitoma', 'mielolipoma', 'cushing', 'conn'];
const KW_RINON = ['rinon', 'renal', 'nefr', 'angiomiolipoma', 'oncocitoma', 'bosniak', 'hidronefrosis', 'pielocalicial', 'calicial', 'celulas claras'];
const KW_VIA_URINARIA = ['ureter', 'uretra', 'vejiga', 'vesical', 'urotelial', 'cistitis', 'urolitiasis', 'litiasis urinaria', 'pieloureteral', 'reflujo vesicoureteral', 'urinom'];
const KW_PERITONEO = ['periton', 'mesenter', 'epiplon', 'omento', 'carcinomatosis', 'ascitis', 'hernia interna'];
const KW_UTERO = ['utero', 'uterin', 'endometr', 'miom', 'adenomiosis', 'cervix', 'cuello uterino', 'cervicouterino'];
const KW_ANEXOS = ['ovari', 'anexial', 'endometrioma', 'teratoma', 'dermoide', 'o-rads', 'orads', 'trompa', 'hidrosalpinx'];
const KW_PROSTATA = ['prostat', 'pi-rads', 'pirads', 'vesicula seminal'];

const L = (...groups) => [...new Set(groups.flat())];

const TAXONOMIA = {
  'Negato': {
    organos: [
      ['Tórax', ['torax', 'pulmon', 'neumo', 'pleura', 'derrame pleural', 'mediastin', 'hilio', 'cardiomegalia', 'atelectasia', 'consolidacion', 'bronq', 'traquea', 'diafragm', 'silueta cardiaca', 'edema pulmonar', 'cavitacion', 'hiperinsuflacion', 'costal', 'costilla', 'alveolar', 'via aerea', 'uci', 'portatil', 'asma', 'tuberculo', 'micobacter', 'colagenopat', 'aspergil', 'aort', 'sindrome aortico', 'toracic', 'bronquiol', 'sarcoid']],
      ['Abdomen', ['abdomen', 'abdominal', 'neumoperitoneo', 'obstruccion', 'ileo', 'asas', 'colon', 'gastric', 'estomag', 'fecaloma', 'volvulo', 'distension', 'neumatosis']],
      ['Columna', ['columna', 'vertebr', 'cervical', 'dorsal', 'lumbar', 'sacro', 'escoliosis', 'espondil', 'listesis', 'aplastamiento', 'odontoides']],
      ['Hombro y extremidad superior', ['hombro', 'clavicul', 'escapul', 'humer', 'codo', 'radio distal', 'cabeza radial', 'cubito', 'muneca', 'mano', 'carpo', 'escafoides', 'metacarp', 'falange', 'dedo', 'acromio']],
      ['Pelvis y cadera', ['pelvis', 'cadera', 'femur', 'acetabul', 'pubi', 'sacroil', 'isquio']],
      ['Rodilla, pierna y pie', ['rodilla', 'rotul', 'tibia', 'perone', 'tobillo', 'pie', 'calcane', 'metatars', 'astragal']],
      ['Cráneo, cara y cuello', ['craneo', 'craneal', 'paranasal', 'sinusitis', 'mandibul', 'orbita', 'facial', 'cuello', 'epiglot', 'adenoides', 'huesos propios']],
      ['Dispositivos y tubos', ['tubo', 'cateter', 'sonda', 'marcapaso', 'cvc', 'drenaje', 'dispositivo', 'tet', 'sng', 'picc']]
    ],
    subtemas: [
      ['Parénquima pulmonar', ['consolidacion', 'neumonia', 'atelectasia', 'nodulo pulmonar', 'masa pulmonar', 'intersticial', 'edema pulmonar', 'cavitacion', 'enfisema', 'vidrio']],
      ['Pleura y neumotórax', ['pleura', 'derrame', 'neumotorax', 'hidroneumotorax', 'empiema', 'engrosamiento pleural']],
      ['Mediastino, hilios y corazón', ['mediastin', 'hilio', 'cardiomegalia', 'pericard', 'aorta', 'silueta cardiaca', 'ensanchamiento']],
      ['Vía aérea', ['traquea', 'bronq', 'cuerpo extrano', 'epiglot', 'crup', 'adenoides']],
      ['Dispositivos y tubos', ['tubo', 'cateter', 'sonda', 'marcapaso', 'cvc', 'drenaje', 'dispositivo', 'tet', 'sng', 'picc']],
      ['Gas abdominal y obstrucción', ['obstruccion', 'ileo', 'neumoperitoneo', 'volvulo', 'distension', 'asas', 'neumatosis', 'fecaloma', 'aire libre']],
      ['Calcificaciones y cuerpos extraños', ['calcific', 'litiasis', 'calculo', 'cuerpo extrano', 'colelit']],
      ['Trauma y fracturas', KW_TRAUMA],
      ['Tumores y lesiones óseas', ['lesion osea', 'litica', 'blastica', 'tumor oseo', 'osteocondroma', 'encondroma', 'quiste oseo', 'metasta', 'mieloma', 'osteosarcoma', 'ewing', 'reaccion periostica', 'osteoma']],
      ['Artropatías', ['artritis', 'artrosis', 'artropatia', 'gota', 'condrocalcinosis', 'espondilitis', 'erosion']],
      ['Óseo difuso y metabólico', ['osteopenia', 'osteoporosis', 'osteomalacia', 'raquitismo', 'hiperparatiroid', 'paget', 'esclerosis osea difusa']],
      ['Infección', KW_INFL],
      ['Pediátrico y congénito', L(KW_CONG, ['neonat', 'prematur', 'displasia de cadera'])]
    ]
  },

  'TC de cuerpo': {
    organos: [
      ['Hígado', KW_HIGADO],
      ['Vía biliar y vesícula', KW_BILIAR],
      ['Páncreas', KW_PANCREAS],
      ['Bazo', KW_BAZO],
      ['Suprarrenales', KW_SUPRARRENAL],
      ['Riñón', KW_RINON],
      ['Vía urinaria y vejiga', KW_VIA_URINARIA],
      ['Esófago, estómago y duodeno', ['esofag', 'estomag', 'gastric', 'gastr', 'cardias', 'hernia hiatal', 'pilor', 'duoden']],
      ['Intestino delgado', ['yeyun', 'ileon', 'ileal', 'intestino delgado', 'invaginac', 'bridas', 'crohn', 'meckel', 'enteritis']],
      ['Colon, recto y apéndice', ['colon', 'colic', 'colit', 'recto', 'rectal', 'sigmoid', 'ciego', 'apendic', 'diverticul', 'volvulo']],
      ['Peritoneo y mesenterio', KW_PERITONEO],
      ['Retroperitoneo y adenopatías', ['retroperiton', 'adenopat', 'ganglio', 'linfadenopatia', 'psoas']],
      ['Aorta y vasos abdominales', ['aort', 'iliac', 'mesenterica', 'celiac', 'vena cava', 'aneurism', 'disecc', 'endoleak', 'endoprotesis', 'hematoma intramural', 'ulcera penetrante']],
      ['Pelvis femenina', L(KW_UTERO, KW_ANEXOS, ['vagina'])],
      ['Pelvis masculina y próstata', L(KW_PROSTATA, ['escrot', 'testic', 'pene'])],
      ['Pulmón y vía aérea', ['pulmon', 'bronq', 'enfisema', 'intersticial', 'neumonia', 'nodulo pulmonar', 'traquea', 'vidrio esmerilado', 'consolidacion', 'fibrosis pulmonar', 'cavitacion', 'lobulo superior', 'lobulo inferior']],
      ['Arterias pulmonares (TEP)', ['tep', 'tromboembolismo pulmonar', 'embolia pulmonar', 'arteria pulmonar', 'hipertension pulmonar']],
      ['Mediastino y pleura', ['mediastin', 'timo', 'timoma', 'pleura', 'derrame pleural', 'empiema', 'mesotelioma', 'neumotorax', 'hilio']],
      ['Corazón y pericardio', ['cardiac', 'corazon', 'pericard', 'coronar', 'miocard', 'auricul', 'ventricul']],
      ['Pared abdominal y partes blandas', ['pared abdominal', 'hernia inguinal', 'hernia umbilical', 'eventracion', 'hernia incisional', 'partes blandas', 'vaina de los rectos', 'spiegel']]
    ],
    subtemas: [
      ['Lesión focal y masas', KW_ONCO],
      ['Estadificación y respuesta', ['estadific', 'tnm', 'recist', 'respuesta a tratamiento', 'control oncologico', 'seguimiento oncologico', 'recurrencia', 'recidiva', 'progresion']],
      ['Inflamatorio e infeccioso', L(KW_INFL, ['colecistitis', 'pancreatitis', 'apendicitis', 'diverticulitis', 'pielonefritis', 'mesenteritis'])],
      ['Trauma', L(KW_TRAUMA, ['hemoperitoneo', 'aast', 'lesion esplenica', 'lesion hepatica traumatica'])],
      ['Vascular', ['aneurism', 'disecc', 'trombo', 'tep', 'isquemi', 'infarto', 'hemorrag', 'sangrado', 'extravasacion', 'pseudoaneurism', 'endoleak', 'vasculitis', 'oclusion', 'hematoma intramural']],
      ['Abdomen agudo', ['abdomen agudo', 'obstruccion', 'perforacion', 'neumoperitoneo', 'volvulo', 'invaginac', 'hernia complicada', 'isquemia mesenterica']],
      ['Difuso y depósito', ['esteatosis', 'hemocromatosis', 'sobrecarga de hierro', 'cirrosis', 'fibrosis', 'hepatopatia', 'amiloid', 'sarcoid']],
      ['Incidentalomas y manejo', ['incidental', 'incidentaloma', 'bosniak', 'lirads', 'li-rads', 'fleischner', 'lung-rads', 'acr']],
      ['Postoperatorio y complicaciones', KW_POSTOP],
      ['Intersticial y vía aérea', ['intersticial', 'nsip', 'uip', 'fibrosis pulmonar', 'bronquiect', 'enfisema', 'bronquiolitis', 'vidrio esmerilado', 'hipersensibilidad', 'mosaico']],
      ['Nódulo y cáncer pulmonar', ['nodulo pulmonar', 'masa pulmonar', 'fleischner', 'lung-rads', 'cancer pulmonar', 'carcinoma pulmonar', 'adenocarcinoma pulmonar']],
      ['Técnica y protocolos', L(KW_TECN, ['fase portal', 'fase arterial', 'fase tardia', 'nefropatia por contraste', 'energia dual'])]
    ]
  },

  'MR de cuerpo': {
    organos: [
      ['Hígado', KW_HIGADO],
      ['Vía biliar y vesícula', L(KW_BILIAR, ['mrcp', 'colangio-rm', 'colangiorm'])],
      ['Páncreas', KW_PANCREAS],
      ['Suprarrenales', KW_SUPRARRENAL],
      ['Riñón', KW_RINON],
      ['Próstata', KW_PROSTATA],
      ['Recto y canal anal', ['recto', 'rectal', 'mesorrecto', 'canal anal', 'perianal', 'fistula anal', 'esfinter anal']],
      ['Útero y cérvix', KW_UTERO],
      ['Ovarios y anexos', KW_ANEXOS],
      ['Obstetricia y placenta', ['placent', 'acretismo', 'accreta', 'fetal', 'feto', 'embaraz', 'gestacion', 'obstetric']],
      ['Vejiga y uretra', ['vejiga', 'vesical', 'uretra', 'urotelial', 'vi-rads', 'virads']],
      ['Intestino (entero-RM)', ['entero', 'crohn', 'ileon', 'ileal', 'intestino delgado', 'enteritis']],
      ['Suelo pélvico', ['suelo pelvico', 'piso pelvico', 'prolapso', 'defeco', 'cistocele', 'rectocele', 'incontinencia']],
      ['Corazón', ['cardiac', 'corazon', 'miocard', 'pericard', 'ventricul', 'realce tardio']],
      ['Vasos (angio-RM)', ['angiorm', 'angio rm', 'angio-rm', 'aort', 'arterial', 'vascular']],
      ['Bazo y peritoneo', L(KW_BAZO, ['periton', 'mesenter'])]
    ],
    subtemas: [
      ['Lesión hepática focal (LI-RADS)', ['lirads', 'li-rads', 'hepatocarcinoma', 'chc', 'hcc', 'hemangioma', 'hnf', 'hiperplasia nodular', 'adenoma hepat', 'metastasis hepat', 'lesion hepatica', 'nodulo hepat', 'colangiocarcinoma']],
      ['Hígado difuso (grasa, hierro, fibrosis)', ['esteatosis', 'grasa hepatica', 'hierro', 'hemocromatosis', 'sobrecarga de hierro', 'fibrosis', 'elastograf', 'cirrosis', 'budd']],
      ['Quistes pancreáticos y vía biliar', ['ipmn', 'tpmi', 'quiste pancrea', 'cistoadenoma', 'neoplasia quistica', 'colangi', 'coledocolit', 'quiste de coledoco', 'colangitis esclerosante', 'mrcp']],
      ['Próstata (PI-RADS)', KW_PROSTATA],
      ['Recto: estadificación y respuesta', ['cancer de recto', 'carcinoma rectal', 'adenocarcinoma de recto', 'mesorrecto', 'fascia mesorrectal', 'respuesta completa', 'neoadyuv', 'crm']],
      ['Ginecológica benigna', ['miom', 'adenomiosis', 'endometriosis', 'endometrioma', 'mulleriana', 'quiste funcional', 'polipo endometrial']],
      ['Ginecológica oncológica', ['cancer de cervix', 'cancer cervicouterino', 'carcinoma de endometrio', 'cancer de endometrio', 'cancer de ovario', 'figo', 'sarcoma uterino']],
      ['Anexos (O-RADS)', ['orads', 'o-rads', 'anexial', 'masa ovarica', 'teratoma', 'dermoide', 'hidrosalpinx', 'torsion ovarica']],
      ['Obstétrica y placenta', ['placent', 'acretismo', 'accreta', 'fetal', 'feto', 'embaraz', 'gestacion', 'obstetric']],
      ['Enfermedad inflamatoria intestinal', ['crohn', 'colitis ulcerosa', 'eii', 'ileitis', 'fistula', 'absceso perianal', 'estenosis inflamatoria', 'perianal']],
      ['Suelo pélvico', ['suelo pelvico', 'piso pelvico', 'prolapso', 'defeco', 'cistocele', 'rectocele', 'incontinencia']],
      ['Suprarrenal y renal', ['adenoma suprarrenal', 'feocromocitoma', 'bosniak', 'angiomiolipoma', 'carcinoma renal', 'quiste renal complejo', 'desplazamiento quimico', 'chemical shift']],
      ['Estadificación oncológica', ['estadific', 'tnm', 'recist', 'recidiva', 'recurrencia', 'respuesta']],
      ['Cardíaca', ['cardiac', 'miocard', 'miocardiopatia', 'miocarditis', 'realce tardio', 'pericard']],
      ['Técnica, secuencias y artefactos', ['secuencia', 'fase opuesta', 'fuera de fase', 'gadoxetato', 'fase hepatobiliar', 'artefacto', 'protocolo', 'gadolinio']]
    ]
  },

  'Ecografía gris': {
    organos: [
      ['Hígado', KW_HIGADO],
      ['Vía biliar y vesícula', KW_BILIAR],
      ['Páncreas', KW_PANCREAS],
      ['Bazo', KW_BAZO],
      ['Riñón', KW_RINON],
      ['Vejiga y próstata', ['vejiga', 'vesical', 'residuo', 'prostat', 'ureterocele']],
      ['Tiroides y paratiroides', ['tiroid', 'tirads', 'ti-rads', 'paratiroid', 'bocio', 'hashimoto']],
      ['Cuello: ganglios y glándulas salivales', ['ganglio', 'adenopat', 'cervical', 'parotid', 'submandibul', 'salival', 'tirogloso', 'branquial', 'cuello']],
      ['Escroto y testículo', ['escrot', 'testic', 'epididim', 'varicocele', 'hidrocele', 'orquitis']],
      ['Útero y ovarios', L(KW_UTERO, KW_ANEXOS, ['transvaginal', 'quiste ovarico'])],
      ['Obstétrica precoz', ['embaraz', 'saco gestacional', 'gestacion', 'ectopico', 'aborto', 'embrion', 'obstetric', 'primer trimestre', 'mola']],
      ['Apéndice e intestino', ['apendic', 'intestin', 'invaginac', 'asas', 'colon', 'ileon', 'diverticul']],
      ['Pared abdominal y hernias', ['hernia', 'pared abdominal', 'eventracion', 'inguinal', 'umbilical', 'diastasis']],
      ['Partes blandas', ['partes blandas', 'lipoma', 'quiste epidermoide', 'absceso subcutaneo', 'celulitis', 'cuerpo extrano', 'subcutane']],
      ['Aorta y retroperitoneo', ['aorta', 'aneurisma aortico', 'retroperiton']]
    ],
    subtemas: [
      ['Lesión focal', ['lesion focal', 'nodul', 'masa', 'quiste', 'hemangioma', 'metasta', 'tumor', 'solido', 'quistic']],
      ['Enfermedad difusa', ['esteatosis', 'hepatopatia', 'cirrosis', 'nefropatia', 'tiroiditis', 'difus']],
      ['Litiasis y obstrucción', ['litiasis', 'colelit', 'calculo', 'hidronefrosis', 'dilatacion', 'obstruccion', 'coledocolit', 'barro biliar']],
      ['Inflamatorio e infeccioso', KW_INFL],
      ['Nódulo tiroideo (TI-RADS)', ['tirads', 'ti-rads', 'nodulo tiroid', 'bethesda']],
      ['Masa anexial (O-RADS US)', ['orads', 'o-rads', 'anexial', 'quiste ovarico', 'endometrioma', 'dermoide', 'masa ovarica']],
      ['Embarazo precoz y ectópico', ['embaraz', 'saco gestacional', 'ectopico', 'aborto', 'embrion', 'mola', 'primer trimestre']],
      ['Escroto agudo', ['torsion', 'escroto agudo', 'orquiepididim', 'epididimitis', 'orquitis', 'trauma testicular']],
      ['Adenopatías', ['adenopat', 'ganglio', 'linfadenitis', 'linfonodo']],
      ['Hernias y pared', ['hernia', 'eventracion', 'diastasis']],
      ['Abdomen agudo', ['apendicitis', 'colecistitis', 'invaginac', 'abdomen agudo', 'diverticulitis', 'dolor abdominal']],
      ['Procedimientos guiados', ['puncion', 'biopsia', 'paaf', 'drenaje', 'marcacion', 'guiad']],
      ['Técnica y artefactos', L(KW_TECN, ['sombra acustica', 'refuerzo posterior', 'reverberacion', 'cola de cometa', 'anisotropia'])]
    ]
  },

  'Ecografía Doppler': {
    organos: [
      ['Carótidas y vertebrales', ['carotid', 'vertebral', 'bulbo carotideo', 'troncos supraaorticos', 'subclavia', 'robo']],
      ['Venas de extremidad inferior', ['tvp', 'trombosis venosa profunda', 'poplite', 'vena femoral', 'safen', 'varices', 'insuficiencia venosa', 'gemelar', 'soleal', 'cayado', 'extremidad inferior']],
      ['Venas de extremidad superior', ['vena subclavia', 'vena axilar', 'vena yugular', 'vena basilica', 'vena cefalica', 'extremidad superior', 'picc']],
      ['Arterias de extremidades', ['arterial periferic', 'arteria femoral', 'arteria poplitea', 'pedia', 'tibial', 'claudicacion', 'isquemia critica', 'indice tobillo', 'bypass', 'by pass', 'injerto arterial']],
      ['Aorta e ilíacas', ['aort', 'iliac', 'aneurisma aortico', 'aaa']],
      ['Arterias renales', ['arteria renal', 'estenosis renal', 'renovascular', 'indice de resistencia renal']],
      ['Porta y venas hepáticas', ['porta', 'portal', 'vena hepatica', 'venas hepaticas', 'hipertension portal', 'cavernomatosis', 'budd', 'tips', 'recanalizacion umbilical', 'esplenorrenal']],
      ['Trasplante hepático', ['trasplante hepatico', 'injerto hepatico', 'arteria hepatica']],
      ['Trasplante renal', ['trasplante renal', 'injerto renal', 'rinon trasplantado']],
      ['Accesos de hemodiálisis', ['fav', 'fistula arteriovenosa', 'acceso vascular', 'hemodialisis', 'protesis de dialisis']],
      ['Escroto', ['testic', 'escrot', 'varicocele', 'torsion testicular', 'epididim']],
      ['Gineco-obstétrico', ['umbilical', 'arteria uterina', 'arterias uterinas', 'cerebral media', 'doppler fetal', 'restriccion de crecimiento', 'rciu', 'placenta', 'torsion ovarica']],
      ['Partes blandas y pseudoaneurismas', ['pseudoaneurism', 'hematoma', 'malformacion vascular', 'hemangioma']]
    ],
    subtemas: [
      ['Estenosis arterial (criterios)', ['estenosis', 'velocidad pico', 'vps', 'nascet', 'oclusion', 'placa', 'ateroma', 'ateroesclero', 'indice de resistencia', 'tardus parvus']],
      ['Trombosis venosa', ['tvp', 'trombo', 'trombosis', 'tromboflebitis']],
      ['Insuficiencia venosa y várices', ['insuficiencia venosa', 'varices', 'reflujo venoso', 'safen', 'perforante', 'cayado']],
      ['Hipertensión portal', ['hipertension portal', 'porta', 'cavernomatosis', 'colateral', 'recanalizacion', 'tips', 'ascitis']],
      ['Evaluación de trasplante', ['trasplante', 'injerto', 'rechazo']],
      ['Aneurismas y pseudoaneurismas', ['aneurism', 'pseudoaneurism']],
      ['Fístulas y malformaciones', ['fistula', 'fav', 'malformacion', 'shunt']],
      ['Isquemia y torsión', ['torsion', 'isquemi', 'infarto']],
      ['Mapeo prequirúrgico', ['mapeo', 'prequirurg', 'preoperatorio', 'planificacion']],
      ['Física y artefactos Doppler', ['aliasing', 'angulo de insonacion', 'prf', 'ganancia', 'artefacto', 'espectro', 'fisica', 'twinkling', 'centelleo']]
    ]
  },

  'Neurorradiología': {
    organos: [
      ['Cerebro', ['cerebr', 'encefal', 'cortical', 'subcortical', 'sustancia blanca', 'ganglios basales', 'talam', 'hipocamp', 'lobulo frontal', 'lobulo temporal', 'lobulo parietal', 'lobulo occipital', 'cuerpo calloso', 'ventricul', 'hemisfer', 'leucoencefal', 'esclerosis multiple', 'desmieliniz', 'acv', 'ictus', 'glioma', 'glioblastoma', 'meningioma', 'subdural', 'hsa', 'hidrocefalia', 'demencia', 'intracraneal', 'infarto', 'intraparenquim', 'cavernoma', 'cadasil', 'melas', 'meningitis', 'ependimitis', 'intraaxial', 'extraaxial', 'snc', 'pineal', 'creutzfeldt', 'adem', 'maltrato', 'trauma no accidental', 'hemorragia intracraneana', 'hemorragia intracraneal']],
      ['Hipófisis y región selar', ['hipofis', 'selar', 'sellar', 'silla turca', 'macroadenoma', 'microadenoma', 'craneofaringioma', 'rathke', 'tallo hipofisario', 'prolactinoma']],
      ['Fosa posterior y tronco', ['cerebel', 'tronco encefal', 'protuberancia', 'bulbo raquideo', 'mesencef', 'fosa posterior', 'pontocerebeloso', 'schwannoma vestibular', 'neurinoma del acustico', 'chiari', 'cuarto ventriculo']],
      ['Órbita', ['orbita', 'orbitar', 'nervio optico', 'globo ocular', 'ocular', 'neuritis optica', 'lacrimal', 'extraocular', 'exoftalm', 'oftalmopatia']],
      ['Hueso temporal y base de cráneo', ['hueso temporal', 'oido', 'colesteatoma', 'mastoid', 'conducto auditivo', 'coclea', 'laberint', 'base de craneo', 'clivus', 'petros', 'otosclerosis', 'glomus', 'paraganglioma yugular']],
      ['Cavidades paranasales y fosas nasales', ['paranasal', 'sinusal', 'sinusitis', 'seno maxilar', 'seno frontal', 'seno esfenoidal', 'etmoid', 'fosa nasal', 'nasal', 'rinosinusitis', 'poliposis', 'mucocele', 'papiloma invertido', 'estesioneuroblastoma']],
      ['Cuello: espacios profundos y ganglios', ['cuello', 'parafaring', 'retrofaring', 'espacio carotideo', 'espacio masticador', 'parotid', 'submandibul', 'glandula salival', 'ganglio cervical', 'adenopatia cervical', 'branquial', 'tirogloso', 'absceso cervical', 'periamigdal']],
      ['Faringe, laringe y cavidad oral', ['faring', 'laring', 'nasofaring', 'orofaring', 'hipofaring', 'cuerdas vocales', 'glotis', 'glotic', 'amigdal', 'epiglot', 'cavidad oral', 'lengua']],
      ['Tiroides y paratiroides', ['tiroid', 'paratiroid', 'bocio']],
      ['Columna y médula', ['columna', 'medula', 'medular', 'raquid', 'vertebr', 'disco', 'discal', 'hernia del nucleo', 'cervical', 'dorsal', 'lumbar', 'sacro', 'cauda equina', 'cono medular', 'mielopatia', 'mielitis', 'siringomielia', 'espondil', 'radicul', 'empiema epidural', 'mielograf', 'intrarraquid']],
      ['Vasos intra y extracraneales', ['aneurism', 'carotid', 'vertebral', 'basilar', 'poligono de willis', 'arteria cerebral', 'mav', 'malformacion arteriovenosa', 'fistula dural', 'seno venoso', 'trombosis venosa cerebral', 'diseccion arterial', 'moyamoya', 'angiotc', 'angio tc', 'angio-tc', 'angiotac', 'angio tac', 'angiorm', 'angio rm', 'angio-rm', 'angiografia', 'senos durales', 'sistema venoso profundo', 'cervicocraneal', 'malformaciones vasculares', 'diseccion']],
      ['Nervios craneales y plexos', ['nervio craneal', 'par craneal', 'trigemin', 'nervio facial', 'plexo braquial', 'plexo', 'neuralgia']]
    ],
    subtemas: [
      ['Vascular isquémico', ['acv', 'ictus', 'infarto', 'isquemi', 'aspects', 'penumbra', 'trombectomia', 'oclusion de gran vaso', 'lacunar', 'perfusion']],
      ['Hemorragia intracraneal', ['hemorrag', 'hematoma', 'hsa', 'subaracnoid', 'subdural', 'epidural', 'intraparenquimatos', 'microsangrado', 'angiopatia amiloide']],
      ['Aneurismas y malformaciones vasculares', ['aneurism', 'mav', 'malformacion arteriovenosa', 'fistula dural', 'cavernoma', 'anomalia venosa del desarrollo', 'telangiectasia', 'moyamoya', 'diseccion']],
      ['Trombosis venosa cerebral', ['trombosis venosa cerebral', 'trombosis de seno', 'seno venoso', 'tvc']],
      ['Sustancia blanca y desmielinizantes', ['sustancia blanca', 'desmieliniz', 'esclerosis multiple', 'em', 'neuromielitis', 'nmo', 'mogad', 'adem', 'leucoencefal', 'leucodistrofia', 'leucoaraiosis', 'microangiopatia', 'lmp', 'fazekas']],
      ['Tumores intraaxiales', ['glioma', 'glioblastoma', 'astrocitoma', 'oligodendroglioma', 'ependimoma', 'meduloblastoma', 'linfoma', 'metasta', 'tumor cerebral', 'dnet', 'ganglioglioma', 'pilocitico']],
      ['Tumores extraaxiales y selares', ['meningioma', 'schwannoma', 'neurinoma', 'adenoma', 'craneofaringioma', 'quiste epidermoide', 'quiste aracnoid', 'cordoma', 'rathke']],
      ['Infección', L(KW_INFL, ['encefalitis', 'meningitis', 'cerebritis', 'ventriculitis', 'toxoplasm', 'neurocisticercosis', 'herpes', 'tuberculoma', 'vih'])],
      ['Trauma (TEC y columna)', L(KW_TRAUMA, ['tec', 'traumatismo encefalocraneano', 'lesion axonal difusa', 'hematoma epidural'])],
      ['Neurodegenerativo y demencias', ['demencia', 'alzheimer', 'atrofia', 'neurodegener', 'parkinson', 'frontotemporal', 'cuerpos de lewy', 'hidrocefalia normotensiva', 'creutzfeldt', 'huntington', 'esclerosis lateral']],
      ['Epilepsia', ['epilep', 'convulsi', 'esclerosis mesial', 'esclerosis hipocampal', 'displasia cortical', 'heterotopia']],
      ['Hidrocefalia y LCR', ['hidrocefalia', 'ventriculomegalia', 'lcr', 'derivacion ventricul', 'hipotension intracraneal', 'fistula de lcr', 'pseudotumor cerebri', 'hipertension intracraneal idiopatica']],
      ['Congénito y del desarrollo', L(KW_CONG, ['chiari', 'dandy', 'esquisencefalia', 'lisencefalia', 'polimicrogiria', 'facomatosis', 'neurofibromatosis', 'esclerosis tuberosa', 'sturge'])],
      ['Metabólico y tóxico', ['metabolic', 'toxic', 'wernicke', 'encefalopatia', 'hipoxic', 'pres', 'hiperamonemia', 'osmotic', 'mielinolisis', 'hipoglicemia', 'intoxicacion', 'monoxido']],
      ['Inflamatorio y autoinmune', ['autoinmune', 'encefalitis autoinmune', 'limbica', 'vasculitis', 'sarcoid', 'lupus', 'behcet', 'hipofisitis', 'igg4']],
      ['Columna degenerativa', KW_DEGEN],
      ['Cabeza y cuello oncológico', ['carcinoma escamoso', 'carcinoma epidermoide', 'cancer de laringe', 'cavidad oral', 'estadific', 'adenopatia metastasica', 'tumor de parotida', 'adenoma pleomorfo', 'warthin']],
      ['Postratamiento', ['radionecrosis', 'pseudoprogresion', 'postratamiento', 'post tratamiento', 'postop', 'postquirurg', 'rano', 'postradiacion']],
      ['Técnica y neuroimagen avanzada', ['espectroscop', 'tractograf', 'resonancia funcional', 'protocolo', 'tecnica', 'artefacto']]
    ]
  },

  'Musculoesquelético': {
    organos: [
      ['Hombro', ['hombro', 'manguito', 'supraespinoso', 'infraespinoso', 'subescapular', 'redondo menor', 'porcion larga del biceps', 'bicipital', 'glenoid', 'glenohumer', 'acromio', 'subacromial', 'bankart', 'hill-sachs', 'hill sachs', 'slap', 'capsulitis', 'troquiter', 'troquin', 'clavicul', 'escapul', 'coracoid', 'humero proximal']],
      ['Codo', ['codo', 'epicondil', 'epitroclea', 'olecran', 'cabeza radial', 'biceps distal', 'tunel cubital', 'capitel', 'radiocubital proximal', 'colateral cubital', 'monteggia', 'essex', 'antebrazo']],
      ['Muñeca y mano', ['muneca', 'mano', 'carpo', 'carpian', 'escafoid', 'semilunar', 'fcct', 'fibrocartilago triangular', 'radiocubital distal', 'quervain', 'tunel carpiano', 'metacarp', 'falange', 'dedo', 'pulgar', 'kienbock', 'polea', 'radio distal', 'galeazzi', 'colles', 'smith', 'barton', 'boxeador', 'mallet', 'metacarpian']],
      ['Cadera', ['cadera', 'acetabul', 'labrum acetabular', 'femoroacetabular', 'fai', 'cam', 'pincer', 'cabeza femoral', 'cuello femoral', 'trocanter', 'gluteo', 'psoas', 'perthes', 'epifisiolisis']],
      ['Pelvis y sacro', ['pelvis', 'pelvic', 'sacro', 'sacroil', 'pubi', 'sinfisis', 'isquio', 'coxis', 'pubalgia', 'isquiotibial proximal']],
      ['Rodilla', ['rodilla', 'menisc', 'ligamento cruzado', 'lca', 'lcp', 'lcm', 'lcl', 'colateral medial', 'colateral lateral', 'rotul', 'patel', 'troclea', 'tendon rotuliano', 'cuadricipit', 'pata de ganso', 'baker', 'hoffa', 'esquina posterolateral', 'plica', 'platillo tibial', 'osgood']],
      ['Tobillo y pie', ['tobillo', 'pie', 'astragal', 'talo', 'calcane', 'aquiles', 'aquileo', 'fascia plantar', 'fascitis plantar', 'peroneo', 'tibial posterior', 'sindesmosis', 'lisfranc', 'chopart', 'metatars', 'hallux', 'neuroma de morton', 'morton', 'seno del tarso', 'escafoides tarsiano', 'tarsal', 'tarso', 'os trigonum', 'sesamoide']],
      ['Columna', ['columna', 'vertebr', 'disco', 'discal', 'espondil', 'lumbar', 'cervical', 'dorsal', 'facetari', 'listesis', 'pars', 'schmorl', 'modic', 'estallido', 'vertebral', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 't12', 'l1', 'l2', 'l3', 'l4', 'l5', 's1', 'sacroil', 'odontoides', 'atlantoaxial', 'atlantooccipital']],
      ['Músculo y partes blandas', ['muscul', 'desgarro muscular', 'rotura fibrilar', 'recto femoral', 'isquiotibial', 'gastrocnemio', 'gemelo', 'soleo', 'aductor', 'miositis', 'partes blandas', 'fascia', 'lipoma', 'morel-lavallee', 'morel lavallee', 'calcificacion heterotopica', 'rabdomiolisis', 'compartimental']],
      ['Hueso y médula ósea (sistémico)', ['medula osea', 'sistemico', 'multifocal', 'osteoporosis', 'osteopenia', 'paget', 'osteomalacia', 'mieloma', 'infiltracion medular', 'reconversion medular', 'gaucher']],
      ['Nervios periféricos', ['nervio', 'neuropatia', 'atrapamiento', 'schwannoma', 'neurofibroma', 'neuroma', 'plexo braquial', 'ciatico', 'parsonage']]
    ],
    subtemas: [
      ['Trauma y fracturas', ['trauma', 'fractura', 'luxacion', 'avulsion', 'politrauma', 'fractura por estres', 'fractura por insuficiencia', 'fractura de estres', 'disrupcion', 'anillo pelviano', 'estallido', 'luxofractura', 'tear drop', 'latigazo', 'espondilolisis', 'patrones de contusion', 'hangman', 'jefferson', 'monteggia', 'galeazzi', 'lisfranc', 'avulsion', 'cuerpos extranos', 'cuerpo extrano']],
      ['Tendones', ['tendin', 'tendon', 'tenosinovitis', 'manguito', 'supraespinoso', 'aquiles', 'entesopatia', 'entesitis', 'bursitis', 'epicondilitis', 'intervalo rotador', 'rotador', 'aparato extensor', 'dedo en gatillo', 'coxa saltans']],
      ['Ligamentos e inestabilidad', ['ligament', 'esguince', 'inestabilidad', 'lca', 'lcp', 'lcm', 'lcl', 'sindesmosis', 'bankart', 'hill-sachs', 'hill sachs', 'colateral', 'esquina posterolateral', 'lisfranc', 'chopart']],
      ['Menisco, labrum, FCCT y cartílago', ['menisc', 'labrum', 'labral', 'slap', 'fcct', 'fibrocartilago', 'condral', 'cartilag', 'osteocondral', 'osteocondritis', 'cuerpo libre', 'pinzamiento', 'femoroacetabular', 'pincer', 'cam', 'isquiofemoral', 'subespinoso']],
      ['Tumores óseos', ['tumor oseo', 'lesion osea', 'osteosarcoma', 'condrosarcoma', 'ewing', 'encondroma', 'osteocondroma', 'osteoma osteoide', 'osteoblastoma', 'tumor de celulas gigantes', 'quiste oseo', 'displasia fibrosa', 'fibroma no osificante', 'histiocitosis', 'metasta', 'mieloma', 'litica', 'blastica', 'lodwick', 'condroblastoma', 'tumores oseos', 'lesiones oseas', 'agresividad', 'calota', 'costal', 'reaccion periostica', 'periostic', 'intraoseas']],
      ['Tumores de partes blandas', ['lipoma', 'liposarcoma', 'sarcoma de partes blandas', 'masa de partes blandas', 'schwannoma', 'neurofibroma', 'desmoide', 'fibromatosis', 'hemangioma', 'malformacion vascular', 'ganglion', 'tgct', 'sinovitis villonodular', 'pvns', 'sarcoma', 'tumores de partes blandas', 'vaina nerviosa']],
      ['Artropatías inflamatorias', ['artritis', 'reumatoide', 'espondiloartr', 'espondilitis', 'psoriasic', 'sacroileitis', 'sinovitis', 'erosion', 'lupus', 'sapho', 'artropatias', 'espondiloartropat']],
      ['Artrosis y degenerativo', L(KW_DEGEN, ['osteoartritis', 'condropatia', 'condromalacia', 'quiste subcondral', 'geoda', 'facetari', 'neuroartropatia', 'charcot'])],
      ['Infección', L(KW_INFL, ['osteomielitis', 'artritis septica', 'espondilodiscitis', 'piomiositis', 'fascitis necrotizante', 'pie diabetico', 'brodie'])],
      ['Metabólico y depósito', L(KW_METAB, ['hidroxiapatita', 'calcificante', 'ocronosis', 'hemofil', 'hemosiderina', 'acromegalia', 'calcinosis', 'osteopenia', 'densidad osea', 'densitometr', 'raquitismo', 'osteodistrofia'])],
      ['Osteonecrosis y edema óseo', ['osteonecrosis', 'necrosis avascular', 'necrosis aseptica', 'infarto oseo', 'kienbock', 'perthes', 'freiberg', 'edema oseo transitorio', 'osteoporosis transitoria', 'sonk', 'insuficiencia subcondral']],
      ['Nervios y síndromes compresivos', ['nervio', 'tunel carpiano', 'tunel cubital', 'tunel tarsiano', 'atrapamiento', 'neuropatia', 'morton', 'neuroma', 'parsonage', 'denervacion']],
      ['Postoperatorio y prótesis', L(KW_POSTOP, ['artroplastia', 'aflojamiento', 'osteolisis periprotesica', 'plastia', 'reconstruccion', 'reparacion', 'tenodesis', 'operada', 'operado', 'material de fijacion', 'artrodesis', 'artroplast'])],
      ['Pediátrico y del desarrollo', L(KW_CONG, ['epifisiolisis', 'perthes', 'osgood', 'salter', 'fisis', 'fisario', 'coalicion tarsiana', 'osteocondrosis', 'apofisitis', 'coalicion'])],
      ['Intervencionismo MSK', ['intervencionismo', 'infiltracion articular', 'infiltracion ecoguiada', 'infiltracion guiada', 'infiltraciones', 'infiltracion con', 'infiltracion de corticoide', 'bloqueo', 'puncion', 'biopsia', 'artrografia', 'barbotage', 'inyeccion', 'tenotomia', 'prp', 'radiofrecuencia', 'ablacion']],
      ['Técnica y anatomía normal', ['tecnica', 'protocolo', 'secuencias', 'artefacto', 'anatomia', 'ciencias basicas', 'proyecciones', 'fisica', 'essr', 'maduracion', 'edad osea', 'histologia', 'ecografia msk', 'artroresonancia', 'artrorresonancia', 'cuerpo entero']],
      ['Médula ósea', ['medula osea', 'sustitutiv', 'reconversion', 'infiltracion medular', 'infiltracion difusa', 'infiltracion de la medula', 'infiltracion de medula']],
      ['Lesiones musculares', ['lesion muscular', 'lesiones musculares', 'desgarro muscular', 'rotura fibrilar', 'edema muscular', 'miositis osificante', 'miopat', 'compartimental', 'deportiv', 'hematoma muscular', 'recto femoral', 'isquiotibial', 'gastrocnemio', 'gemelo', 'soleo', 'aductor', 'pectoral mayor', 'biceps femoral', 'semimembranoso', 'semitendinoso', 'unión miotendinosa', 'union miotendinosa']],
      ['Variantes normales y pitfalls', ['variante', 'pitfall', 'accesorio', 'os trigonum', 'os naviculare', 'os acromiale', 'buford', 'sublabral', 'pseudodefecto', 'seudodefecto']]
    ]
  },

  'Pediatría': {
    organos: [
      ['Tórax y vía aérea', ['torax', 'pulmon', 'neumon', 'bronq', 'traquea', 'via aerea', 'crup', 'epiglotitis', 'cuerpo extrano', 'mediastin', 'timo', 'atelectasia', 'derrame', 'cpam', 'secuestro', 'hernia diafragmatica', 'membrana hialina', 'taquipnea transitoria', 'aspiracion meconial', 'displasia broncopulmonar', 'respiratori', 'diafragm', 'toracic', 'neumopat', 'asma', 'eventracion']],
      ['Tubo digestivo y abdomen', ['estenosis hipertrofica', 'pilor', 'invaginac', 'malrotacion', 'volvulo', 'apendic', 'enterocolitis', 'ecn', 'atresia duodenal', 'atresia esofagica', 'atresia intestinal', 'hirschsprung', 'ileo meconial', 'meckel', 'obstruccion', 'intestin', 'abdomen', 'reflujo gastroesofagico', 'trauma abdominal', 'tc abdominal', 'abdominal']],
      ['Hígado, vía biliar y bazo', ['higad', 'hepat', 'biliar', 'atresia biliar', 'quiste de coledoco', 'colelit', 'hepatoblastoma', 'bazo', 'esplen', 'kasai', 'hipertension portal', 'trasplante hepatico']],
      ['Riñón y vía urinaria', ['rinon', 'renal', 'nefr', 'hidronefrosis', 'pielectasia', 'reflujo vesicoureteral', 'rvu', 'valvas', 'pieloureteral', 'ureterocele', 'duplicidad', 'multiquistic', 'wilms', 'pielonefritis', 'uretrocistografia', 'vejiga', 'hipertension arterial', 'trasplante renal', 'litiasis urinaria', 'nefrocalcinosis']],
      ['Suprarrenales y retroperitoneo', ['suprarrenal', 'neuroblastoma', 'retroperiton']],
      ['Corazón y grandes vasos', ['cardiopat', 'cardiac', 'coartacion', 'arco aortico', 'anillo vascular', 'anillos vasculares', 'fallot', 'transposicion', 'canal av', 'ductus', 'drenaje venoso anomalo']],
      ['Gónadas y pelvis', ['ovari', 'testic', 'escrot', 'utero', 'pelvis', 'criptorquid', 'hidrocele', 'pubertad', 'genitograf', 'sexo ambiguo']],
      ['Neuro (cerebro)', ['cerebr', 'encefal', 'matriz germinal', 'leucomalacia', 'hipoxico isquemic', 'hidrocefalia', 'transfontanelar', 'fontanela', 'craneosinostosis', 'macrocefalia', 'glioma', 'meduloblastoma', 'ependimoma', 'pilocitico', 'neurocutane', 'neurofibromatosis', 'esclerosis tuberosa', 'craneo', 'craneal', 'suturas']],
      ['Columna y médula', ['columna', 'medula', 'medular', 'disrafia', 'mielomeningocele', 'medula anclada', 'cono medular', 'escoliosis', 'sinus dermico', 'lipomielo', 'lumbar', 'espondil', 'scheuermann']],
      ['Musculoesquelético', ['displasia de cadera', 'ddh', 'cadera', 'epifisiolisis', 'perthes', 'fractura', 'salter', 'fisis', 'osteomielitis', 'artritis septica', 'sinovitis transitoria', 'displasia esqueletica', 'raquitismo', 'rodilla', 'codo', 'oseo', 'hueso', 'edad osea', 'defecto fibroso', 'fibroma no osificante', 'osteocondrosis', 'pie bot', 'pie plano', 'coalicion', 'tumores oseos', 'artritis', 'raquitismo', 'oseas', 'displasias esqueleticas', 'sifilis']],
      ['Cabeza y cuello', ['cuello', 'orbita', 'paranasal', 'sinusitis', 'adenoides', 'adenitis', 'tirogloso', 'branquial', 'linfangioma', 'malformacion linfatica', 'hemangioma infantil', 'retrofaring', 'mastoiditis', 'oido', 'tiroid', 'adenopat', 'cervical', 'salival', 'parotid', 'glandulas salivales']]
    ],
    subtemas: [
      ['Neonatal', ['neonat', 'recien nacido', 'prematur', 'membrana hialina', 'taquipnea transitoria', 'aspiracion meconial', 'ecn', 'enterocolitis necrotizante', 'matriz germinal', 'leucomalacia', 'cateter umbilical', 'displasia broncopulmonar']],
      ['Congénito y malformaciones', L(KW_CONG, ['cpam', 'secuestro', 'hernia diafragmatica', 'malrotacion', 'hirschsprung', 'valvas', 'ureterocele', 'disrafia'])],
      ['Abdomen agudo pediátrico', ['invaginac', 'apendicitis', 'estenosis hipertrofica', 'malrotacion', 'volvulo', 'obstruccion', 'torsion', 'abdomen agudo', 'meckel']],
      ['Infección', L(KW_INFL, ['neumonia', 'bronquiolitis', 'osteomielitis', 'artritis septica', 'pielonefritis', 'adenitis', 'retrofaring', 'meningitis', 'crup'])],
      ['Tumores pediátricos', ['neuroblastoma', 'wilms', 'nefroblastoma', 'hepatoblastoma', 'rabdomiosarcoma', 'meduloblastoma', 'ependimoma', 'pilocitico', 'glioma', 'linfoma', 'leucemia', 'ewing', 'osteosarcoma', 'teratoma', 'tumor', 'masa']],
      ['Maltrato infantil', ['maltrato', 'abuso', 'no accidental', 'lesiones metafisarias', 'fracturas costales posteriores', 'nino sacudido']],
      ['Trauma', L(KW_TRAUMA, ['salter', 'fractura en rodete', 'torus', 'tallo verde', 'supracondilea'])],
      ['Hidronefrosis y RVU', ['hidronefrosis', 'pielectasia', 'reflujo vesicoureteral', 'rvu', 'valvas', 'pieloureteral', 'megaureter', 'ureterocele', 'uretrocistografia', 'sfu']],
      ['Cadera y ortopedia', ['displasia de cadera', 'ddh', 'graf', 'epifisiolisis', 'perthes', 'pie bot', 'coalicion', 'escoliosis', 'osgood']],
      ['Displasias esqueléticas y metabólico', ['displasia esqueletica', 'acondroplasia', 'osteogenesis imperfecta', 'raquitismo', 'mucopolisacaridosis', 'escorbuto', 'edad osea']],
      ['Síndromes y facomatosis', ['sindrome', 'neurofibromatosis', 'esclerosis tuberosa', 'sturge', 'von hippel', 'down', 'turner', 'beckwith', 'vacterl', 'facomatosis']],
      ['Técnica y protección radiológica', ['dosis', 'alara', 'radioproteccion', 'proteccion radiologica', 'tecnica', 'sedacion', 'protocolo', 'ceus']]
    ]
  },

  'Imágenes mamarias': {
    organos: [
      ['Mama', ['mama', 'mamari', 'cuadrante', 'parenquima mamario', 'calcific', 'bi-rads', 'birads', 'nodul', 'masa', 'distorsion', 'asimetria', 'fibroadenoma', 'carcinoma ductal', 'carcinoma lobulillar', 'mamograf', 'tomosintesis', 'quiste', 'carcinoma', 'biopsia', 'estereotax', 'galactograf', 'mastitis', 'calcificacion']],
      ['Axila y ganglios', ['axila', 'axilar', 'ganglio', 'adenopat', 'centinela']],
      ['Pezón y región retroareolar', ['pezon', 'retroareolar', 'areola', 'secrecion', 'telorrea', 'ectasia ductal', 'galactoforo']],
      ['Implantes', ['implante', 'protesis mamaria', 'ruptura intracapsular', 'ruptura extracapsular', 'siliconoma', 'bia-alcl', 'periprotesic', 'linguini']],
      ['Mama operada y postratamiento', ['postop', 'postquirurg', 'cicatriz', 'mastectomia', 'tumorectomia', 'cirugia conservadora', 'necrosis grasa', 'seroma', 'radioterapia', 'reconstruccion', 'colgajo', 'postratamiento']],
      ['Mama masculina', ['ginecomastia', 'mama masculina', 'masculin', 'varon', 'hombre']]
    ],
    subtemas: [
      ['Masas (BI-RADS)', ['masa', 'nodul', 'fibroadenoma', 'quiste', 'carcinoma ductal', 'carcinoma lobulillar', 'filodes', 'lipoma', 'hamartoma', 'bi-rads', 'birads']],
      ['Calcificaciones', ['calcific', 'pleomorf', 'amorfa', 'lineales finas', 'segmentaria']],
      ['Distorsión arquitectural', ['distorsion', 'cicatriz radial', 'lesion esclerosante compleja', 'espiculad']],
      ['Asimetrías', ['asimetria']],
      ['Tamizaje, densidad y riesgo', ['tamizaje', 'screening', 'densidad mamaria', 'brca', 'alto riesgo', 'tomosintesis']],
      ['RM mamaria', ['resonancia', 'rm mamaria', 'realce', 'realce no masa', 'bpe', 'curva cinetica', 'cinetica']],
      ['Ecografía mamaria', ['ecograf', 'elastograf']],
      ['Procedimientos (biopsia y marcación)', ['biopsia', 'core', 'estereotax', 'vacuum', 'marcacion', 'arpon', 'clip', 'paaf', 'concordancia', 'radiopatologic']],
      ['Estadificación y neoadyuvancia', ['estadific', 'neoadyuv', 'respuesta', 'multifocal', 'multicentric', 'contralateral', 'carcinoma inflamatorio', 'recidiva']],
      ['Lesiones de alto riesgo (B3)', ['atipia', 'hiperplasia ductal atipica', 'lobulillar in situ', 'neoplasia lobulillar', 'cicatriz radial', 'papiloma', 'b3', 'atipia epitelial plana']],
      ['Inflamatorio e infeccioso', L(KW_INFL, ['mastitis', 'galactocele'])],
      ['Implantes', ['implante', 'protesis mamaria', 'ruptura', 'siliconoma', 'bia-alcl', 'linguini']],
      ['Mama masculina', ['ginecomastia', 'mama masculina']]
    ]
  },

  'Digestivo': {
    organos: [
      ['Faringe y esófago', ['faring', 'esofag', 'deglucion', 'acalasia', 'zenker', 'presbiesofago', 'hernia hiatal', 'reflujo gastroesofagico', 'cardias', 'schatzki', 'membrana esofagica', 'varices esofagicas', 'barrett', 'digestivo alto', 'disfagia', 'contrastado', 'esofagogram']],
      ['Estómago y duodeno', ['estomag', 'gastric', 'gastr', 'duoden', 'pilor', 'ulcera peptica', 'linitis', 'bezoar', 'gastrectomia']],
      ['Intestino delgado', ['intestino delgado', 'yeyun', 'ileon', 'ileal', 'ileitis', 'crohn', 'enteritis', 'celiaca', 'meckel', 'carcinoide', 'bridas', 'invaginac']],
      ['Colon y recto', ['colon', 'colic', 'colit', 'recto', 'rectal', 'sigmoid', 'ciego', 'diverticul', 'polipo', 'colorrectal', 'colonograf', 'enema', 'megacolon', 'volvulo']],
      ['Hígado', KW_HIGADO],
      ['Vía biliar y vesícula', KW_BILIAR],
      ['Páncreas', KW_PANCREAS],
      ['Peritoneo, mesenterio y pared', L(KW_PERITONEO, ['hernia', 'pared abdominal'])],
      ['Anastomosis y cirugía bariátrica', ['bariatric', 'bypass gastrico', 'by pass gastrico', 'manga gastrica', 'sleeve', 'anastomo', 'gastroyeyuno', 'fundoplic', 'nissen', 'ileostom', 'colostom', 'petersen']],
      ['Suelo pélvico y canal anal', ['suelo pelvico', 'piso pelvico', 'defecograf', 'prolapso', 'rectocele', 'fistula perianal', 'perianal', 'esfinter anal', 'canal anal', 'incontinencia fecal']],
      ['Vejiga y uretra (fluoroscopía)', ['vejiga', 'vesical', 'uretra', 'uretral', 'cistograf', 'uretrocistograf', 'uretrograf', 'reflujo vesicoureteral', 'valvas']],
      ['Útero y trompas (histerosalpingografía)', ['histerosalping', 'hsg', 'trompa', 'tubaric', 'hidrosalpinx', 'utero', 'uterin']]
    ],
    subtemas: [
      ['EED y esofagograma', ['eed', 'esofagogram', 'esofagograf', 'esofago estomago duodeno', 'esofago-estomago-duodeno', 'serie esofagogastroduodenal', 'seriada', 'transito esofag', 'bario', 'baritad']],
      ['Videodeglución', ['videodeglucion', 'video deglucion', 'videofluoroscop', 'deglucion', 'penetracion laringea', 'aspiracion laringotraqueal', 'aspiracion', 'disfagia orofaringea', 'residuo en valleculas', 'valleculas', 'senos piriformes']],
      ['Histerosalpingografía', ['histerosalping', 'hsg', 'obstruccion tubaria', 'hidrosalpinx', 'infertilidad']],
      ['Cistografía', ['cistograf', 'rotura vesical', 'fistula vesical', 'filtracion vesical', 'dehiscencia vesical', 'fuga vesical']],
      ['Uretrocistografía (retrógrada y miccional)', ['uretrocistograf', 'uretrograf', 'ucg', 'cumg', 'miccional', 'estenosis uretral', 'estrechez uretral', 'valvas', 'reflujo vesicoureteral', 'rvu', 'lesion uretral', 'rotura uretral']],
      ['Estudios contrastados y técnica', ['transito', 'enema', 'contraste hidrosoluble', 'fluoroscop', 'radioscop', 'tecnica', 'protocolo']],
      ['Motilidad y trastornos funcionales', ['motilidad', 'acalasia', 'espasmo', 'presbiesofago', 'dismotilidad', 'disfagia', 'reflujo', 'gastroparesia', 'pseudoobstruccion']],
      ['Neoplasias', L(KW_ONCO, ['polipo', 'poliposis', 'linitis', 'carcinoide'])],
      ['Enfermedad inflamatoria intestinal', ['crohn', 'colitis ulcerosa', 'eii', 'ileitis', 'fistula', 'estenosis inflamatoria', 'enfermedad inflamatoria']],
      ['Obstrucción', ['obstruccion', 'ileo', 'bridas', 'volvulo', 'invaginac', 'bezoar', 'impactacion']],
      ['Postquirúrgico y complicaciones', L(KW_POSTOP, ['bariatric', 'manga gastrica', 'bypass gastrico', 'fundoplic', 'hernia interna', 'estoma', 'ileostom', 'colostom'])],
      ['Divertículos y hernias', ['diverticul', 'hernia', 'zenker', 'hiatal', 'meckel']],
      ['Enterografía TC/RM', ['enterograf', 'entero-tc', 'entero-rm', 'enterorm', 'enterotc', 'enteroclisis']],
      ['Colonografía TC', ['colonograf', 'colonoscopia virtual', 'colono-tc', 'colonotc']],
      ['Defecografía y suelo pélvico', ['defecograf', 'suelo pelvico', 'piso pelvico', 'prolapso', 'rectocele', 'enterocele', 'descenso perineal', 'anismo']],
      ['Hemorragia digestiva', ['hemorragia digestiva', 'sangrado digestivo', 'hemorrag', 'sangrado', 'melena', 'hematoquecia', 'angiodisplasia', 'extravasacion']],
      ['Hepatobiliopancreático', ['higad', 'hepat', 'biliar', 'colangi', 'coledoc', 'pancrea', 'colecist', 'vesicul', 'lirads', 'ipmn']],
      ['Inflamatorio e infeccioso', L(KW_INFL, ['apendicitis', 'diverticulitis', 'colitis', 'pancreatitis', 'colecistitis'])]
    ]
  },

  'Intervencional': {
    organos: [
      ['Hígado y sistema portal', ['higad', 'hepat', 'portal', 'porta', 'tips', 'quimioemboliz', 'tace', 'tare', 'radioemboliz', 'hepatocarcinoma', 'chc', 'hcc', 'budd']],
      ['Vía biliar y vesícula', ['biliar', 'colangiografia percutanea', 'cpt', 'ptc', 'protesis biliar', 'stent biliar', 'colecistostomia', 'coledoc', 'colangi', 'klatskin']],
      ['Riñón y vía urinaria', ['nefrostom', 'renal', 'rinon', 'ureter', 'urinari', 'doble j', 'angiomiolipoma', 'vejiga']],
      ['Arterial periférico', ['arteria femoral', 'poplitea', 'tibial', 'extremidad inferior', 'claudicacion', 'isquemia critica', 'arterial periferic', 'subclavia']],
      ['Aorta y ramas viscerales', ['aort', 'evar', 'tevar', 'endoprotesis', 'endoleak', 'aneurism', 'disecc', 'mesenterica', 'celiac', 'esplenica', 'visceral']],
      ['Venoso y accesos', ['venos', 'vena cava', 'filtro de vena cava', 'filtro vci', 'cateter venoso central', 'cvc', 'picc', 'reservorio', 'acceso vascular', 'fav', 'hemodialisis', 'tvp', 'may-thurner', 'may thurner', 'varicocele', 'congestion pelvica']],
      ['Tórax (pulmón, pleura, bronquial)', ['torax', 'pulmon', 'pleura', 'empiema', 'biopsia pulmonar', 'hemoptisis', 'arteria bronquial', 'tep', 'tromboembolismo pulmonar']],
      ['Neurointervención', ['aneurisma cerebral', 'aneurisma intracraneal', 'trombectomia mecanica', 'acv', 'ictus', 'mav', 'fistula dural', 'carotid', 'vertebral', 'angiografia cerebral']],
      ['Útero, próstata y pelvis', ['utero', 'uterin', 'mioma', 'hemorragia postparto', 'prostat', 'pelvis', 'pelvic']],
      ['Hueso y partes blandas', ['hueso', 'oseo', 'vertebroplastia', 'cifoplastia', 'osteoma osteoide', 'partes blandas', 'malformacion vascular', 'escleroterapia']],
      ['Tracto digestivo', ['gastrostomia', 'yeyunostomia', 'hemorragia digestiva', 'sangrado digestivo', 'gastroduodenal', 'varices', 'brto', 'dilatacion esofagica']]
    ],
    subtemas: [
      ['Accesos vasculares y técnica', ['acceso', 'seldinger', 'introductor', 'hemostasia', 'cierre percutaneo', 'via radial', 'via femoral', 'tecnica']],
      ['Embolización (hemorragia y trauma)', ['emboliz', 'hemorrag', 'sangrado', 'hemoptisis', 'pseudoaneurism', 'extravasacion', 'trauma', 'coils', 'particulas', 'gelfoam', 'onyx', 'cianoacrilato']],
      ['Oncología intervencional', ['tace', 'tare', 'quimioemboliz', 'radioemboliz', 'ablacion', 'radiofrecuencia', 'microondas', 'crioablacion', 'hepatocarcinoma', 'chc', 'hcc', 'metasta', 'embolizacion portal']],
      ['Biopsias percutáneas', ['biopsia', 'puncion', 'paaf', 'trucut', 'core']],
      ['Drenajes percutáneos', ['drenaje', 'coleccion', 'absceso', 'pig tail', 'pigtail', 'empiema', 'colecistostomia']],
      ['Intervención biliar', ['biliar', 'colangiograf', 'cpt', 'ptc', 'stent biliar', 'protesis biliar', 'colangitis', 'klatskin']],
      ['Urológica (nefrostomía, doble J)', ['nefrostom', 'doble j', 'ureter', 'urinoma']],
      ['Angioplastia y stent', ['angioplastia', 'stent', 'balon', 'estenosis', 'oclusion', 'recanaliz', 'endovascular']],
      ['Trombectomía y trombólisis', ['trombectomia', 'trombolisis', 'fibrinolisis', 'tromboaspiracion', 'trombo']],
      ['TIPS e hipertensión portal', ['tips', 'hipertension portal', 'varices', 'brto', 'ascitis refractaria', 'budd']],
      ['Aorta endovascular', ['evar', 'tevar', 'endoprotesis', 'endoleak', 'aneurisma aortico', 'diseccion aortica']],
      ['Complicaciones y manejo clínico', ['complicacion', 'reaccion adversa', 'nefropatia por contraste', 'profilaxis', 'coagulacion', 'inr', 'anticoagul', 'antiagreg', 'sedacion', 'consentimiento']],
      ['Materiales y dispositivos', ['cateter', 'guia', 'introductor', 'coils', 'filtro', 'dispositivo', 'material', 'microcateter', 'plug', 'amplatzer']]
    ]
  }
};

/* ---------------- Clasificador ---------------- */
const _taxIdx = {};
const _reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function _buildIdx(list) {
  const arr = [];
  for (const [label, kws] of list) for (const k of kws) {
    const kk = k.trim(); if (!kk) continue;
    const re = kk.length <= 3 ? new RegExp(`(?<![a-z0-9])${_reEsc(kk)}(?![a-z0-9])`, 'g') : new RegExp(_reEsc(kk), 'g');
    arr.push({ len: kk.length, w: kk.length <= 3 ? 8 : Math.min(kk.length, 14), re, label });
  }
  return arr.sort((a, b) => b.len - a.len);
}
function _taxFor(esp) {
  if (!TAXONOMIA[esp]) return null;
  if (!_taxIdx[esp]) _taxIdx[esp] = { org: _buildIdx(TAXONOMIA[esp].organos), sub: _buildIdx(TAXONOMIA[esp].subtemas) };
  return _taxIdx[esp];
}
function _best(idx, text, allowed) {
  let t = ' ' + text + ' ';
  const score = {};
  for (const { re, label, w } of idx) {
    if (allowed && !allowed.includes(label)) continue;
    let hit = false;
    t = t.replace(re, m => { hit = true; return '\u0001'.repeat(m.length); });
    if (hit) score[label] = (score[label] || 0) + w;
  }
  let best = '', bs = 0;
  for (const [k, v] of Object.entries(score)) if (v > bs) { bs = v; best = k; }
  return best;
}
/** Sugiere órgano y subtema para un texto (diagnóstico o tema del temario) dentro de una especialidad. */
function classifyText(esp, text, allowedSub) {
  const ix = _taxFor(esp);
  const t = String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!ix || !t.trim()) return { organo: '', subtema: '' };
  return { organo: _best(ix.org, t), subtema: _best(ix.sub, t, allowedSub) };
}
const organosDe = esp => (TAXONOMIA[esp] ? TAXONOMIA[esp].organos.map(o => o[0]) : []);
const subtemasDe = esp => (TAXONOMIA[esp] ? TAXONOMIA[esp].subtemas.map(o => o[0]) : []);

/** Puntaje de afinidad de un texto con una especialidad (para sugerir la especialidad de un material). */
function espScore(esp, text) {
  const ix = _taxFor(esp); if (!ix) return 0;
  let t = ' ' + String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() + ' ', sc = 0;
  for (const { re, w } of ix.org) t = t.replace(re, m => { sc += w; return '\u0001'.repeat(m.length); });
  return sc;
}

/* ---------- Sistemas de clasificación (Bosniak, LI-RADS, Salter-Harris…) ----------
   Se detectan en el diagnóstico con su valor («Bosniak IIF», «LI-RADS 5») y sirven para filtrar y practicar. */
const CLASIF = [
  ['Bosniak', 'bosniak'], ['LI-RADS', 'li-?rads'], ['PI-RADS', 'pi-?rads'], ['BI-RADS', 'bi-?rads'], ['TI-RADS', '(?:acr[ -])?ti-?rads'],
  ['O-RADS', 'o-?rads'], ['Lung-RADS', 'lung-?rads'], ['C-RADS', 'c-?rads'], ['VI-RADS', 'vi-?rads'], ['Fleischner', 'fleischner'],
  ['Lodwick', 'lodwick'], ['Salter-Harris', 'salter[ -]?harris'], ['Schatzker', 'schatzker'], ['Garden', 'garden'], ['Pauwels', 'pauwels'],
  ['Neer', 'neer'], ['Weber', 'weber'], ['Lauge-Hansen', 'lauge[ -]?hansen'], ['Mason', 'mason'], ['Frykman', 'frykman'], ['Gustilo', 'gustilo'],
  ['Rockwood', 'rockwood'], ['Tile', 'tile'], ['Young-Burgess', 'young[ -]?burgess'], ['Denis', 'denis'], ['TLICS', 'tlics'], ['SLIC', 'slic'],
  ['Anderson-D\'Alonzo', 'anderson'], ['Sanders', 'sanders'], ['Hawkins', 'hawkins'], ['Mayfield', 'mayfield'], ['Kellgren-Lawrence', 'kellgren(?:[ -]?lawrence)?'],
  ['Outerbridge', 'outerbridge'], ['ICRS', 'icrs'], ['Pfirrmann', 'pfirrmann'], ['Modic', 'modic'], ['Ficat', 'ficat'], ['ARCO', 'arco'],
  ['Meyerding', 'meyerding'], ['Stoller', 'stoller'], ['Snyder (SLAP)', 'snyder'], ['AO/OTA', 'ao/ota|ao'], ['AAST', 'aast'], ['Balthazar', 'balthazar'],
  ['Atlanta', 'atlanta'], ['Todani', 'todani'], ['Stanford', 'stanford'], ['DeBakey', 'de ?bakey'], ['Fazekas', 'fazekas'], ['ASPECTS', 'aspects'],
  ['Fisher', 'fisher'], ['Hunt y Hess', 'hunt(?: y | and |-)hess|hunt'], ['WFNS', 'wfns'], ['Spetzler-Martin', 'spetzler(?:[ -]?martin)?'],
  ['Borden', 'borden'], ['Cognard', 'cognard'], ['Graf', 'graf'], ['SFU', 'sfu'], ['Bethesda', 'bethesda'], ['Lugano', 'lugano'], ['FIGO', 'figo'],
  ['Hinchey', 'hinchey'], ['Child-Pugh', 'child(?:[ -]?pugh)?'], ['RECIST', 'recist'], ['Deauville', 'deauville'], ['Nascet', 'nascet'],
  ['Kaiser (neuromielitis)', 'kaiser'], ['McDonald', 'mc ?donald'], ['TNM', 'tnm']
];
const _clasRe = CLASIF.map(([name, pat]) => [name, new RegExp(
  `(?<![a-z0-9])(?:${pat})(?![a-z])[\\s:-]*(?:tipo|grado|grade|type|clase|categoria|estadio)?\\s*(iif|iii|ii|iv|vi|v|i|[0-9]{1,2}[a-c]?|[a-e][0-9]?|tr|m|na)?(?![a-z0-9])`, 'g')]);
function detectClasif(text) {
  const t = String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), out = [];
  for (const [name, re] of _clasRe) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      if (name === 'AO/OTA' && !m[1]) continue;                   // «ao» suelto es muy ambiguo
      if (['Garden', 'Weber', 'Mason', 'Tile', 'Denis', 'Hawkins', 'Sanders', 'Graf', 'Stanford', 'Atlanta', 'Anderson-D\'Alonzo', 'Child-Pugh', 'Fisher', 'Kaiser (neuromielitis)'].includes(name) && !m[1]) continue;
      const v = m[1] ? ' ' + (/^[ivx]+f?$|^iif$/.test(m[1]) ? m[1].toUpperCase() : m[1].toUpperCase()) : '';
      const tag = name + v;
      if (!out.includes(tag)) out.push(tag);
    }
  }
  return out;
}
const clasifName = tag => { const c = CLASIF.find(([n]) => tag === n || tag.startsWith(n + ' ')); return c ? c[0] : tag.replace(/\s+\S+$/, ''); };
