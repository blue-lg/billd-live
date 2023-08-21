import mpegts from 'mpegts.js';
import { Ref, nextTick, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useFlvPlay, useHlsPlay } from '@/hooks/use-play';
import { useSrsWs } from '@/hooks/use-srs-ws';
import { DanmuMsgTypeEnum, IDanmu, IMessage, liveTypeEnum } from '@/interface';
import { WsMsgTypeEnum } from '@/network/webSocket';
import { useAppStore } from '@/store/app';
import { useNetworkStore } from '@/store/network';
import { useUserStore } from '@/store/user';
import { createVideo, videoToCanvas } from '@/utils';

export function usePull({
  localVideoRef,
  isSRS,
  liveType,
}: {
  localVideoRef: Ref<HTMLVideoElement[]>;
  isSRS: boolean;
  liveType: liveTypeEnum;
}) {
  const route = useRoute();
  const userStore = useUserStore();
  const networkStore = useNetworkStore();
  const appStore = useAppStore();
  const roomId = ref(route.params.roomId as string);
  const roomLiveType = ref<liveTypeEnum>(liveType);
  const danmuStr = ref('');
  const autoplayVal = ref(false);
  const videoLoading = ref(false);
  const flvurl = ref('');
  const hlsurl = ref('');
  const sidebarList = ref<
    {
      socketId: string;
    }[]
  >([]);
  const videoElArr = ref<HTMLVideoElement[]>([]);
  const remoteVideo = ref<HTMLElement[]>([]);
  const {
    mySocketId,
    initSrsWs,
    roomLiving,
    liveRoomInfo,
    anchorInfo,
    roomNoLive,
    localStream,
    liveUserList,
    damuList,
  } = useSrsWs();

  const { flvPlayer, flvVideoEl, startFlvPlay } = useFlvPlay();
  const { hlsVideoEl, startHlsPlay } = useHlsPlay();
  const stopDrawingArr = ref<any[]>([]);

  onUnmounted(() => {
    handleStopDrawing();
  });

  function handleStopDrawing() {
    stopDrawingArr.value.forEach((cb) => cb());
    stopDrawingArr.value = [];
  }

  async function handleHlsPlay(url?: string) {
    console.log('handleHlsPlay');
    handleStopDrawing();
    videoLoading.value = true;
    const { width, height } = await startHlsPlay({
      hlsurl: url || hlsurl.value,
    });
    const { canvas, stopDrawing } = videoToCanvas({
      videoEl: hlsVideoEl.value!,
      size: { width, height },
    });
    stopDrawingArr.value.push(stopDrawing);
    remoteVideo.value.push(canvas);
    videoLoading.value = false;
  }

  async function handleFlvPlay() {
    console.log('handleFlvPlay');
    handleStopDrawing();
    const { width, height } = await startFlvPlay({
      flvurl: flvurl.value,
    });
    const size = { width, height };
    const initCanvas = videoToCanvas({
      videoEl: flvVideoEl.value!,
      size,
    });
    stopDrawingArr.value.push(initCanvas.stopDrawing);
    remoteVideo.value.push(initCanvas.canvas);
    flvPlayer.value!.on(mpegts.Events.MEDIA_INFO, () => {
      console.log('数据变了');
      size.width = flvVideoEl.value!.videoWidth!;
      size.height = flvVideoEl.value!.videoHeight!;
    });
    videoLoading.value = false;
  }

  async function handlePlay() {
    if (roomLiveType.value === liveTypeEnum.srsFlvPull) {
      if (!autoplayVal.value) return;
      await handleFlvPlay();
    } else if (roomLiveType.value === liveTypeEnum.srsHlsPull) {
      if (!autoplayVal.value) return;
      await handleHlsPlay();
    }
  }

  watch(
    () => autoplayVal.value,
    (val) => {
      console.log('autoplayVal变了', val);
      if (val && roomLiveType.value === liveTypeEnum.webrtcPull) {
        handlePlay();
      }
    }
  );

  watch(
    () => roomLiving.value,
    (val) => {
      if (val) {
        flvurl.value = liveRoomInfo.value?.flv_url!;
        hlsurl.value = liveRoomInfo.value?.hls_url!;
        handlePlay();
      }
    }
  );
  watch(
    () => appStore.muted,
    (newVal) => {
      console.log('muted变了', newVal);
      videoElArr.value.forEach((el) => {
        el.muted = newVal;
      });
    }
  );

  watch(
    () => localStream,
    (stream) => {
      if (stream.value) {
        console.log('localStream变了');
        console.log('音频轨：', stream.value?.getAudioTracks());
        console.log('视频轨：', stream.value?.getVideoTracks());
        if (roomLiveType.value === liveTypeEnum.webrtcPull) {
          videoElArr.value.forEach((dom) => {
            dom.remove();
          });
          stream.value?.getVideoTracks().forEach((track) => {
            console.log('视频轨enabled：', track.id, track.enabled);
            const video = createVideo({});
            video.setAttribute('track-id', track.id);
            video.srcObject = new MediaStream([track]);
            remoteVideo.value.push(video);
            videoElArr.value.push(video);
          });
          stream.value?.getAudioTracks().forEach((track) => {
            console.log('音频轨enabled：', track.id, track.enabled);
            const video = createVideo({});
            video.setAttribute('track-id', track.id);
            video.srcObject = new MediaStream([track]);
            remoteVideo.value.push(video);
            videoElArr.value.push(video);
          });
          videoLoading.value = false;
        } else if (roomLiveType.value === liveTypeEnum.srsWebrtcPull) {
          videoElArr.value.forEach((dom) => {
            dom.remove();
          });
          stream.value?.getVideoTracks().forEach((track) => {
            console.log('视频轨enabled：', track.id, track.enabled);
            const video = createVideo({});
            video.setAttribute('track-id', track.id);
            video.srcObject = new MediaStream([track]);
            // document.body.appendChild(video);
            remoteVideo.value.push(video);
            videoElArr.value.push(video);
          });
          stream.value?.getAudioTracks().forEach((track) => {
            console.log('音频轨enabled：', track.id, track.enabled);
            const video = createVideo({});
            video.setAttribute('track-id', track.id);
            video.srcObject = new MediaStream([track]);
            remoteVideo.value.push(video);
            videoElArr.value.push(video);
          });
          videoLoading.value = false;
        }
      } else {
        videoElArr.value?.forEach((item) => {
          item.remove();
        });
      }
    },
    { deep: true }
  );

  watch(
    [
      () => userStore.userInfo,
      () => networkStore.wsMap.get(roomId.value)?.socketIo?.connected,
    ],
    ([userInfo, connected]) => {
      if (userInfo && connected) {
        const instance = networkStore.wsMap.get(roomId.value);
        if (!instance) return;
      }
    }
  );

  function initPull(autolay = true) {
    autoplayVal.value = autolay;
    if (autoplayVal.value) {
      videoLoading.value = true;
    }
    initSrsWs({
      roomId: roomId.value,
      isAnchor: false,
    });
  }

  function closeWs() {
    const instance = networkStore.wsMap.get(roomId.value);
    instance?.close();
  }

  function closeRtc() {
    networkStore.rtcMap.forEach((rtc) => {
      rtc.close();
    });
  }

  function addVideo() {
    sidebarList.value.push({ socketId: mySocketId.value });
    nextTick(() => {
      liveUserList.value.forEach((item) => {
        const socketId = item.id;
        if (socketId === mySocketId.value) {
          localVideoRef.value[mySocketId.value].srcObject = localStream.value;
        }
      });
    });
  }

  function keydownDanmu(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (key === 'enter') {
      event.preventDefault();
      sendDanmu();
    }
  }

  function sendDanmu() {
    if (!danmuStr.value.trim().length) {
      window.$message.warning('请输入弹幕内容！');
      return;
    }
    const instance = networkStore.wsMap.get(roomId.value);
    if (!instance) return;
    const danmu: IDanmu = {
      socket_id: mySocketId.value,
      userInfo: userStore.userInfo,
      msgType: DanmuMsgTypeEnum.danmu,
      msg: danmuStr.value,
    };
    const messageData: IMessage['data'] = {
      msg: danmuStr.value,
      msgType: DanmuMsgTypeEnum.danmu,
      live_room_id: Number(roomId.value),
    };
    instance.send({
      msgType: WsMsgTypeEnum.message,
      data: messageData,
    });
    damuList.value.push(danmu);
    danmuStr.value = '';
  }

  return {
    initPull,
    closeWs,
    closeRtc,
    mySocketId,
    keydownDanmu,
    sendDanmu,
    addVideo,
    handleHlsPlay,
    handleFlvPlay,
    remoteVideo,
    roomLiveType,
    roomLiving,
    autoplayVal,
    videoLoading,
    roomNoLive,
    damuList,
    liveUserList,
    sidebarList,
    danmuStr,
    liveRoomInfo,
    anchorInfo,
  };
}
