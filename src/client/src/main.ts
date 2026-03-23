import Phaser from 'phaser';
import { IsoScene } from './IsoScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1a1a2e',
  parent: 'game',
  scene: [IsoScene],
};

new Phaser.Game(config);
