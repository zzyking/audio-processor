import React, { useState, useRef } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 20px;
`;

const Section = styled.div`
  width: 80%;
  margin: 20px 0;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 10px;
`;

const SectionTitle = styled.h2`
  margin-bottom: 10px;
  font-size: 24px;
`;

const Button = styled.button`
  font-size: 16px;
  padding: 10px 20px;
  margin: 10px;
  cursor: pointer;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 5px;
  &:hover {
    background-color: #45a049;
  }
`;

const InputLabel = styled.label`
  display: inline-block;
  font-size: 16px;
  padding: 10px 20px;
  margin: 10px;
  cursor: pointer;
  background-color: #008cba;
  color: white;
  border: none;
  border-radius: 5px;
  &:hover {
    background-color: #007bb5;
  }
`;

const Label = styled.label`
  font-size: 16px;
  padding: 10px 20px;
`;

const HiddenInput = styled.input`
  display: none;
`;

const AudioContainer = styled.div`
  margin: 20px 0;
  text-align: center;
`;

const AudioTitle = styled.h2`
  font-size: 18px;
  margin: 10px 0;
`;

const Loader = styled.div`
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 2s linear infinite;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const Select = styled.select`
  padding: 10px;
  margin: 10px;
  font-size: 16px;
`;

const Input = styled.input`
  padding: 10px;
  margin: 10px;
  font-size: 16px;
`;

const AudioProcessor = () => {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [noisyAudioURL, setNoisyAudioURL] = useState('');
  const [filteredAudioURL, setFilteredAudioURL] = useState('');
  const audioContextRef = useRef(new (window.AudioContext || window.webkitAudioContext)());
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [snr, setSnr] = useState(20);
  const [filterLength, setFilterLength] = useState(127);
  const [lowFreq, setLowFreq] = useState(300);
  const [highFreq, setHighFreq] = useState(3400);
  const [filterType, setFilterType] = useState('bandpass');
  const [stepSize, setstepSize] = useState(0.0001);

  const startRecording = () => {
    setRecording(true);
    audioChunksRef.current = [];
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = event => {
        audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = processAudio;
      mediaRecorderRef.current.start();
    });
  };

  const stopRecording = () => {
    setRecording(false);
    mediaRecorderRef.current.stop();
  };

  const processAudio = () => {
    setLoading(true);
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(audioBlob);
    setAudioURL(audioUrl);
    setLoading(false);
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const audioUrl = URL.createObjectURL(file);
      setAudioURL(audioUrl);
    }
  };

  const addNoiseAndFilter = async () => {
    try {
      setLoading(true);
      const audioBuffer = await fetch(audioURL)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioContextRef.current.decodeAudioData(arrayBuffer));

      const noisyBuffer = addGaussianNoise(audioBuffer, snr);
      let filteredBuffer;
      if (filterType === 'adaptive') {
        filteredBuffer = applyAdaptiveFilter(noisyBuffer, filterLength, audioBuffer.sampleRate);
      } else if (filterType === 'bandpass') {
        filteredBuffer = applyBandpassFilter(noisyBuffer, filterLength, lowFreq, highFreq, audioBuffer.sampleRate);
      } else if (filterType === 'wiener') {
        filteredBuffer = applyWienerFilter(noisyBuffer);
      }

      setNoisyAudioURL(URL.createObjectURL(bufferToWave(noisyBuffer, noisyBuffer.length)));
      setFilteredAudioURL(URL.createObjectURL(bufferToWave(filteredBuffer, filteredBuffer.length)));
    } catch (error) {
      console.error('Error processing audio:', error);
    } finally {
      setLoading(false);
    }
  };

  const addGaussianNoise = (buffer, snr) => {
    const channelData = buffer.getChannelData(0);
    const signalPower = channelData.reduce((acc, val) => acc + val * val, 0) / channelData.length;
    const noisePower = signalPower / Math.pow(10, snr / 10);
    const noise = new Float32Array(channelData.length).map(() => Math.sqrt(noisePower) * (Math.random() * 2 - 1));
    const noisyData = new Float32Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      noisyData[i] = channelData[i] + noise[i];
    }
    const noisyBuffer = audioContextRef.current.createBuffer(1, noisyData.length, buffer.sampleRate);
    noisyBuffer.copyToChannel(noisyData, 0);
    return noisyBuffer;
  };

  const applyBandpassFilter = (buffer, filterLength, passbandStart, passbandEnd, sampleRate) => {
    const nyquist = sampleRate / 2;
    const normalPassbandStart = passbandStart / nyquist;
    const normalPassbandEnd = passbandEnd / nyquist;
    const taps = new Float32Array(filterLength);

    for (let i = 0; i < filterLength; i++) {
      const m = i - (filterLength - 1) / 2;
      if (m === 0) {
        taps[i] = 2 * (normalPassbandEnd - normalPassbandStart);
      } else {
        taps[i] = (Math.sin(2 * Math.PI * normalPassbandEnd * m) - Math.sin(2 * Math.PI * normalPassbandStart * m)) / (Math.PI * m);
        taps[i] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (filterLength - 1)); // Hamming window
      }
    }

    const filteredData = new Float32Array(buffer.length);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      let sum = 0;
      for (let j = 0; j < filterLength; j++) {
        if (i - j >= 0) {
          sum += channelData[i - j] * taps[j];
        }
      }
      filteredData[i] = sum;
    }

    const filteredBuffer = audioContextRef.current.createBuffer(1, filteredData.length, buffer.sampleRate);
    filteredBuffer.copyToChannel(filteredData, 0);
    return filteredBuffer;
  };

  const applyAdaptiveFilter = (buffer, filterLength, sampleRate) => {
    const channelData = buffer.getChannelData(0);
    const desiredSignal = channelData.slice(); // 假设理想信号已知或近似为无噪声信号
    const filteredData = new Float32Array(channelData.length);
    const filterWeights = new Float32Array(filterLength).fill(0);
    const stepSize = 0.0001; // 步长因子，控制滤波器调整速度

    for (let i = 0; i < channelData.length - filterLength; i++) {
      const x = channelData.slice(i, i + filterLength);
      const y = filterWeights.reduce((sum, weight, j) => sum + weight * x[j], 0);
      const e = desiredSignal[i] - y;

      for (let j = 0; j < filterLength; j++) {
        filterWeights[j] += stepSize * e * x[j];
      }

      filteredData[i] = y;
    }

    const filteredBuffer = audioContextRef.current.createBuffer(1, filteredData.length, buffer.sampleRate);
    filteredBuffer.copyToChannel(filteredData, 0);
    return filteredBuffer;
  };
  const applyWienerFilter = (buffer) => {
    const channelData = buffer.getChannelData(0);
    const noisePower = channelData.reduce((acc, val) => acc + val * val, 0) / channelData.length;

    const filteredData = channelData.map((value, index) => {
      const localMean = (channelData[index - 1] || 0) + value + (channelData[index + 1] || 0) / 3;
      const localVariance = Math.pow(channelData[index - 1] || 0 - localMean, 2) + Math.pow(value - localMean, 2) + Math.pow(channelData[index + 1] || 0 - localMean, 2) / 3;
      const signalPower = Math.max(localVariance - noisePower, 0);
      const gain = signalPower / (signalPower + noisePower);
      return gain * value;
    });

    const filteredBuffer = audioContextRef.current.createBuffer(1, filteredData.length, buffer.sampleRate);
    filteredBuffer.copyToChannel(filteredData, 0);
    return filteredBuffer;
  };

  const bufferToWave = (buffer, len) => {
    const numOfChan = buffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);
    const channels = [];
    let sample;
    let offset = 0;
    let pos = 0;
  
    const setUint16 = (data) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };
  
    const setUint32 = (data) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };
  
    const writeString = (str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(pos++, str.charCodeAt(i));
      }
    };
  
    writeString('RIFF');             // ChunkID
    setUint32(length - 8);           // ChunkSize
    writeString('WAVE');             // Format
    writeString('fmt ');             // Subchunk1ID
    setUint32(16);                   // Subchunk1Size
    setUint16(1);                    // AudioFormat (PCM)
    setUint16(numOfChan);            // NumChannels
    setUint32(buffer.sampleRate);    // SampleRate
    setUint32(buffer.sampleRate * 2 * numOfChan); // ByteRate
    setUint16(numOfChan * 2);        // BlockAlign
    setUint16(16);                   // BitsPerSample
    writeString('data');             // Subchunk2ID
    setUint32(length - pos - 4);     // Subchunk2Size
  
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
  
    while (offset < len) {
      for (let i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset])); // Clamp sample to range [-1, 1]
        sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0; // Convert to 16-bit PCM
        view.setInt16(pos, sample, true); // Write sample to DataView
        pos += 2;
      }
      offset++;
    }
  
    const blob = new Blob([bufferArray], { type: 'audio/wav' });
    return blob;
  };
  

  return (
    <Container>
      <Section>
        <SectionTitle>输入</SectionTitle>
        <Button onClick={recording ? stopRecording : startRecording}>
          {recording ? '停止录音' : '开始录音'}
        </Button>
        <InputLabel>
          导入音频
          <HiddenInput type="file" accept="audio/*" onChange={handleFileUpload} />
        </InputLabel>
        {audioURL && (
          <AudioContainer>
            <AudioTitle>原始音频</AudioTitle>
            <audio controls src={audioURL} />
          </AudioContainer>
        )}
      </Section>
      <Section>
        <SectionTitle>噪声与滤波器设置</SectionTitle>
        <div>
          <Label>
            信噪比 (dB):
            <Input type="number" value={snr} onChange={(e) => setSnr(e.target.value)} />
          </Label>
          <Label>
            滤波器类型:
            <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="bandpass">带通</option>
              <option value="adaptive">自适应</option>
              <option value="wiener">维纳滤波</option>
            </Select>
          </Label>
        </div>
        {filterType === 'bandpass' && (
          <Container>
            <Label>
              滤波器长度:
              <Input type="number" value={filterLength} onChange={(e) => setFilterLength(e.target.value)} />
            </Label>
            <Label>
              最低频率 (Hz):
              <Input type="number" value={lowFreq} onChange={(e) => setLowFreq(e.target.value)} />
            </Label>
            <Label>
              最高频率 (Hz):
              <Input type="number" value={highFreq} onChange={(e) => setHighFreq(e.target.value)} />
            </Label>
          </Container>
        )}
        {filterType === 'adaptive' && (
          <Container>
            <Label>
              步长:
              <Input type="number" value={stepSize} onChange={(e) => setstepSize(e.target.value)} />
            </Label>
          </Container>
        )}
        
        <Button onClick={addNoiseAndFilter}>处理音频</Button>
      </Section>
      {loading && <Loader />}
      <Section>
        <SectionTitle>处理后音频</SectionTitle>
          {noisyAudioURL && (
            <AudioContainer>
              <AudioTitle>加噪后音频</AudioTitle>
              <audio controls src={noisyAudioURL} />
            </AudioContainer>
          )}
          {filteredAudioURL && (
            <AudioContainer>
              <AudioTitle>降噪后音频</AudioTitle>
              <audio controls src={filteredAudioURL} />
            </AudioContainer>
          )}
      </Section>
    </Container>
  );
};

export default AudioProcessor;
