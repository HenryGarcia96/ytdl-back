const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
app.use(cors());
app.use(express.json());

const videosFolder = path.join(__dirname, 'videos');

// Asegurarse de que la carpeta de videos exista
if (!fs.existsSync(videosFolder)) {
    fs.mkdirSync(videosFolder);
}
app.post('/formats', async (req, res) => {
    try {
        // Obtiene url
        const { url } = req.body;

        // Valida url
        if (!ytdl.validateURL(url)) {
            return res.status(400).json({ error: 'URL no válida' });
        }

        const info = await ytdl.getInfo(url);

        // Obtener información de los formatos disponibles
        const formats = info.formats.map(format => ({
            itag: format.itag,
            quality: format.qualityLabel || 'Desconocida',
            mimeType: format.mimeType.split(';')[0], // Mostrar solo el tipo de contenido (ej. video/mp4)
            hasVideo: !!format.qualityLabel,
            hasAudio: !!format.audioBitrate,
            audioBitrate: format.audioBitrate || 'No disponible',
            url: format.url // URL de prueba (algunas pueden ser temporales)
        }));

        res.status(200).json({ formats });
    } catch (error) {
        console.error('❌ Error al obtener formatos:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});


app.post('/download', async (req, res) => {
    try {
        // url via peticion
        const {url} = req.body;

        // Validacion de url
        if(! ytdl.validateURL(url)){
            return res.status(400).json({error:'Url no valida'});
        }

        // Ruta de los archivos
        const info = await ytdl.getInfo(url);
        const videoTitle = info.videoDetails.title.replace(/[\\/:*?"<>|]/g, '');

         // Obtener el mejor video (sin audio)
         const videoFormat = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });

         // Obtener el mejor audio
         const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });

        // Verificamos 
        if (!videoFormat || !audioFormat) {
            return res.status(400).json({ error: 'No se encontraron formatos adecuados' });
        }

        // Obtener extensiones reales
        const videoExt = videoFormat.container || 'mp4';
        const audioExt = audioFormat.container || 'mp4';
        
        const videoPath = path.join(videosFolder, `${videoTitle}_video.${videoExt}`);
        const audioPath = path.join(videosFolder, `${videoTitle}_audio.${audioExt}`);
        const outputPath = path.join(videosFolder, `${videoTitle}.mp4`);

        // / Descargar video sin audio
        const videoStream = ytdl(url, { format: videoFormat }).pipe(fs.createWriteStream(videoPath));


        videoStream.on('finish', () => {
            console.log(`✅ Video guardado en: ${videoPath}`);

            checkFilesAndConvert();
            
        });

        videoStream.on('error', (err) =>{
            console.error('Error al guardar el video', err);
            res.status(400).json({error: 'Error al guardar video'});
        });

        // Descargar audio
        const audioStream = ytdl(url, { format: audioFormat }).pipe(fs.createWriteStream(audioPath));

        audioStream.on('finish', () => {
            console.log(`✅ Audio guardado en: ${audioPath}`);
           
            // converter(videoStream, audioStream, outputPath);
        });
        audioStream.on('error', (err) =>{
            console.error('Error al guardar el audio', err);
            res.status(400).json({error: 'Error al guardar audio'});
        });

         // Usar ffmpeg para fusionar audio y video
        // Codificacion del audio y video
        if (!fs.existsSync(videoPath)) {
            console.error(`El archivo de video no se encuentra en la ruta: ${videoPath}`);
            return res.status(400).json({ error: 'El archivo de video no existe' });
        }
        
        if (!fs.existsSync(audioPath)) {
            console.error(`El archivo de audio no se encuentra en la ruta: ${audioPath}`);
            return res.status(400).json({ error: 'El archivo de audio no existe' });
        }


        function checkFilesAndConvert() {
            // Verificar si ambos archivos existen
            if (fs.existsSync(videoPath) && fs.existsSync(audioPath)) {
                console.log('Ambos archivos están listos para ser combinados');
                converter(videoPath, audioPath, outputPath);
            } else {
                console.error('Los archivos no están disponibles aún.');
                res.status(400).json({ error: 'Los archivos no están disponibles para combinar.' });
            }
        }

        return res.status(200).json({message: "Video and audio download successfully"});


    } catch (error) {
        console.log(error);
        return res.status(500).json({error: 'Internal Server Error'})
    }
});


function converter(videoPath, audioPath, outputPath){
    ffmpeg()
    .input(videoPath)
    .input(audioPath)
    .outputOptions('-c:v copy')
    .outputOptions('-c:a aac')
    .output(outputPath)
    .on('end', () => {
        console.log(`✅ Video fusionado en: ${outputPath}`);

        // Eliminar archivos temporales
        fs.unlinkSync(videoPath);
        fs.unlinkSync(audioPath);
    })
    .on('error', (err, stdout, stderr) => {
        console.error('❌ Error al combinar audio y video:', err.message);
        console.error('STDOUT:', stdout);
        console.error('STDERR:', stderr);
    })
    .run();
}


const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});