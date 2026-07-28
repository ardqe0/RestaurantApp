import jsQR from "jsqr";
import { createElement, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type WebQrScannerProps = {
  active: boolean;
  onScanned: (data: string) => void;
};

const rearCameraPattern = /(back|rear|environment|world|arka)/i;
const frontCameraPattern = /(front|user|face|on kamera|ön kamera)/i;

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function openRearCamera(): Promise<MediaStream> {
  let stream: MediaStream;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { exact: "environment" } }
    });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
  }

  const currentTrack = stream.getVideoTracks()[0];
  const currentSettings = currentTrack?.getSettings();
  if (currentSettings?.facingMode === "environment") {
    return stream;
  }

  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
  if (cameras.length < 2) {
    return stream;
  }

  const rearCamera =
    cameras.find((camera) => rearCameraPattern.test(camera.label))
    ?? [...cameras].reverse().find((camera) => !frontCameraPattern.test(camera.label));

  if (!rearCamera || rearCamera.deviceId === currentSettings?.deviceId) {
    return stream;
  }

  stopStream(stream);
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { deviceId: { exact: rearCamera.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
  });
}

export function WebQrScanner({ active, onScanned }: WebQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastScanRef = useRef(0);
  const scannedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    let disposed = false;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    scannedRef.current = false;
    setIsReady(false);
    setCameraError(null);

    const scanFrame = (time: number) => {
      if (disposed || scannedRef.current) {
        return;
      }

      const video = videoRef.current;
      if (context && video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && time - lastScanRef.current >= 180) {
        lastScanRef.current = time;
        const scale = Math.min(1, 960 / video.videoWidth);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });

        if (result?.data) {
          scannedRef.current = true;
          onScanned(result.data);
          return;
        }
      }

      frameRef.current = requestAnimationFrame(scanFrame);
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Bu tarayıcı kamera erişimini desteklemiyor.");
      }

      const stream = await openRearCamera();
      if (disposed) {
        stopStream(stream);
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopStream(stream);
        return;
      }

      video.srcObject = stream;
      video.muted = true;
      video.setAttribute("playsinline", "true");
      await video.play();
      if (!disposed) {
        setIsReady(true);
        frameRef.current = requestAnimationFrame(scanFrame);
      }
    };

    void start().catch((error: unknown) => {
      if (!disposed) {
        const message = error instanceof Error ? error.message : "Kamera açılamadı.";
        setCameraError(`Arka kamera açılamadı: ${message}`);
      }
    });

    return () => {
      disposed = true;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      stopStream(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [active, onScanned, retryKey]);

  return (
    <>
      <View style={styles.cameraFrame}>
        {createElement("video", {
          autoPlay: true,
          muted: true,
          playsInline: true,
          ref: videoRef,
          style: styles.video
        })}
        <View pointerEvents="none" style={styles.cameraOverlay}>
          <View style={styles.scanTarget} />
        </View>
        {!isReady && !cameraError ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.loadingText}>Arka kamera açılıyor...</Text>
          </View>
        ) : null}
      </View>

      {cameraError ? (
        <View style={styles.errorPanel}>
          <Text style={styles.errorText}>{cameraError}</Text>
          <Pressable
            onPress={() => setRetryKey((value) => value + 1)}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Kamerayı tekrar aç</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.hint}>QR kodunu çerçevenin içine getirin.</Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  cameraFrame: {
    backgroundColor: "#0b1f1b",
    borderRadius: 20,
    height: 360,
    overflow: "hidden",
    position: "relative",
    width: "100%"
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  cameraOverlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  scanTarget: {
    borderColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 3,
    height: 220,
    width: 220
  },
  loadingOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    bottom: 0,
    gap: 10,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  hint: {
    color: "#4a5e59",
    marginTop: 12,
    textAlign: "center"
  },
  errorPanel: {
    alignItems: "center",
    gap: 12,
    marginTop: 14
  },
  errorText: {
    color: "#b42318",
    textAlign: "center"
  },
  retryButton: {
    backgroundColor: "#31506a",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11
  },
  retryButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  }
});
