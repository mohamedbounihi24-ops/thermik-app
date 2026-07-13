import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'recording' | 'recorded'

const PREFERRED_MIME_TYPE = 'audio/webm;codecs=opus'
const FALLBACK_MIME_TYPE = 'audio/webm'

// generate-devis (openai.ts) construit toujours un fichier "audio.webm"
// côté serveur avant l'appel Whisper — il faut donc un vrai conteneur
// webm, pas un format arbitraire. Safari ne supporte ni l'un ni l'autre
// en MediaRecorder : on le détecte ici, avant même de demander la
// permission micro, plutôt que de laisser échouer silencieusement plus
// tard (502 opaque côté serveur).
function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  if (MediaRecorder.isTypeSupported(PREFERRED_MIME_TYPE)) return PREFERRED_MIME_TYPE
  if (MediaRecorder.isTypeSupported(FALLBACK_MIME_TYPE)) return FALLBACK_MIME_TYPE
  return null
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // getUserMedia laisse le voyant micro du navigateur allumé tant que les
  // tracks ne sont pas explicitement stop()ées.
  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async () => {
    setError(null)
    const mimeType = pickMimeType()
    if (!mimeType) {
      setError(
        "Votre navigateur ne supporte pas l'enregistrement audio requis pour cette fonctionnalité. Essayez avec Chrome ou Firefox.",
      )
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError(
        "Permission microphone refusée. Autorisez l'accès au micro dans les paramètres du navigateur pour enregistrer une note vocale.",
      )
      return
    }

    streamRef.current = stream
    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      setAudioBlob(new Blob(chunksRef.current, { type: mimeType }))
      setState('recorded')
      stopTracks()
    }

    recorder.start()
    setState('recording')
  }, [stopTracks])

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop()
  }, [])

  const reset = useCallback(() => {
    stopTracks()
    mediaRecorderRef.current = null
    chunksRef.current = []
    setAudioBlob(null)
    setError(null)
    setState('idle')
  }, [stopTracks])

  // Démontage pendant un enregistrement en cours (navigation ailleurs) :
  // sans ça le micro resterait actif indéfiniment.
  useEffect(() => stopTracks, [stopTracks])

  return { state, audioBlob, error, start, stop, reset }
}
